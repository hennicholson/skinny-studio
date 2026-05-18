import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import crypto from "crypto"

export const runtime = "nodejs"

// Verify Whop webhook signature
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret)
  hmac.update(payload)
  const computedSignature = hmac.digest("hex")
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  )
}

// Generate UUID from string (same as whop.ts)
function generateUUIDFromString(input: string): string {
  const hash = crypto.createHash("sha256").update(input).digest("hex")
  const uuidHex = hash.substring(0, 32)
  return [
    uuidHex.substring(0, 8),
    uuidHex.substring(8, 12),
    "4" + uuidHex.substring(13, 16),
    "8" + uuidHex.substring(17, 20),
    uuidHex.substring(20, 32),
  ].join("-")
}

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const signature = request.headers.get("x-whop-signature") || ""
    const webhookSecret = process.env.WHOP_WEBHOOK_SECRET || ""

    // Verify signature if secret is configured (FAIL CLOSED)
    if (webhookSecret) {
      if (!signature) {
        console.error("Webhook secret configured but no signature provided")
        return NextResponse.json({ error: "Missing signature" }, { status: 401 })
      }
      const isValid = verifyWebhookSignature(body, signature, webhookSecret)
      if (!isValid) {
        console.error("Invalid webhook signature")
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    const event = JSON.parse(body)
    const eventType = event.action || event.event || "unknown"

    console.log("Whop webhook received:", eventType)

    // IDEMPOTENCY: rely on webhook_events.event_id UNIQUE constraint (added by
    // the 20260516221608_atomic_billing migration). Plain INSERT; the constraint
    // raises Postgres error code 23505 (unique_violation) on duplicate delivery.
    // This is more portable than depending on PostgREST's "empty array means
    // conflict" semantics for upsert+ignoreDuplicates.
    //
    // If the migration's UNIQUE constraint is somehow missing, this insert will
    // succeed on duplicates and we'll fall through to handlePaymentSuccess. The
    // downstream apply_topup_credit RPC's idempotency_key index is the second
    // line of defense — it will reject duplicate credits regardless.
    if (event.id) {
      const { error: insertError } = await sbAdmin.from("webhook_events").insert({
        event_source: "whop",
        event_id: event.id,
        event_type: eventType,
        signature_valid: !!signature,
        payload: event,
        processed: false,
      })

      if (insertError) {
        if (insertError.code === "23505") {
          // unique_violation on event_id → already processed, exit cleanly.
          console.log("Webhook already recorded, skipping:", event.id)
          return NextResponse.json({ received: true, duplicate: true })
        }
        // Any other DB error: log and fall through. apply_topup_credit is still
        // idempotent on idempotency_key, so even if we re-process a payment
        // event the user can't be double-credited.
        console.error("Failed to record webhook event:", insertError)
      }
    } else {
      // No event id — log without idempotency guarantee.
      await sbAdmin.from("webhook_events").insert({
        event_source: "whop",
        event_id: null,
        event_type: eventType,
        signature_valid: !!signature,
        payload: event,
        processed: false,
      })
    }

    // Handle different event types
    switch (eventType) {
      case "payment.succeeded":
      case "membership.went_valid":
        await handlePaymentSuccess(event)
        break

      case "membership.went_invalid":
        // Handle subscription cancellation if needed
        console.log("Membership went invalid:", event.data?.id)
        break

      default:
        console.log("Unhandled webhook event:", eventType)
    }

    // Mark as processed
    if (event.id) {
      await sbAdmin
        .from("webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("event_id", event.id)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}

async function handlePaymentSuccess(event: any) {
  const data = event.data || {}
  const userId = data.user_id || data.user?.id
  const planId = data.plan_id || data.plan?.id
  const productId = data.product_id || data.product?.id
  const amount = data.amount || data.final_amount || 0
  const metadata = data.metadata || {}

  console.log("Payment event data:", JSON.stringify(data, null, 2))
  console.log("Payment metadata:", JSON.stringify(metadata, null, 2))

  if (!userId) {
    console.error("No user ID in payment event")
    return
  }

  // Check if we have metadata from checkout configuration (in-app purchase).
  // The metadata contains the whop_user_id from the charge route. We previously
  // also threaded a profile_id through here for direct lookup, but the new
  // apply_topup_credit RPC keys on whop_user_id and auto-creates / locks the
  // profile internally, so profile_id is no longer needed.
  let whopUserId: string

  if (metadata.whop_user_id) {
    whopUserId = metadata.whop_user_id
    console.log("Using whop_user_id from metadata:", whopUserId)
  } else {
    // Generate the UUID we use internally
    whopUserId = generateUUIDFromString(userId)
    console.log("Generated whop_user_id from event userId:", userId, "->", whopUserId)
  }

  // Find the topup plan if this is a credit purchase
  let creditsToAdd = 0
  let planName = "Unknown"

  // First, check if credits are in metadata (from in-app purchase)
  if (metadata.credits) {
    creditsToAdd = Math.round(Number(metadata.credits) * 100) // Convert dollars to cents
    planName = metadata.plan_name || `$${metadata.price} Top-up`
    console.log(`Credits from metadata: ${creditsToAdd} cents (${metadata.credits} dollars)`)
  }
  // Then try to match by plan ID
  else if (planId) {
    const { data: plan } = await sbAdmin
      .from("topup_plans")
      .select("*")
      .eq("whop_plan_id", planId)
      .maybeSingle()

    if (plan) {
      creditsToAdd = Math.round(Number(plan.credits) * 100) // Convert dollars to cents
      planName = plan.name
      console.log(`Found plan: ${plan.name}, adding ${creditsToAdd} cents`)
    }
  }

  // If no plan matched, try to infer from amount
  if (creditsToAdd === 0 && amount > 0) {
    creditsToAdd = Math.round(amount * 100) // 1:1 dollar to credit
    planName = `$${amount} Top-up`
  }

  // === ATOMIC TOPUP (credit + tx + idempotency in one RPC) ===
  // apply_topup_credit auto-creates the user_profile via INSERT ... ON CONFLICT
  // DO NOTHING (relies on user_profiles_whop_user_id_key unique constraint).
  // Replaces the legacy "lookup + manual insert + balance UPDATE + tx insert" dance.
  if (!event.id) {
    console.error("Cannot credit topup without event.id (RPC requires it as idempotency key)")
    return
  }

  if (creditsToAdd > 0) {
    const { data: creditResult, error: creditError } = await sbAdmin.rpc(
      "apply_topup_credit",
      {
        p_whop_user_id: whopUserId,
        p_whop_event_id: event.id,
        p_credits_cents: creditsToAdd,
        p_plan_name: planName,
        p_extra_metadata: {
          event_type: event.action,
          plan_id: planId,
          product_id: productId,
        },
      }
    )

    if (creditError) {
      console.error("apply_topup_credit RPC error:", creditError)
      return
    }

    const status = (creditResult as any)?.status
    switch (status) {
      case "credited":
        console.log(
          `Added ${creditsToAdd} cents to user ${whopUserId}, new balance: ${(creditResult as any).new_balance_cents} (tx ${(creditResult as any).tx_id})`
        )
        break
      case "already_credited":
        console.log(`Duplicate Whop event ignored: ${event.id} (tx ${(creditResult as any).tx_id})`)
        break
      case "user_not_found":
      case "invalid_args":
      default:
        console.error(`apply_topup_credit returned ${status}:`, creditResult)
        return
    }
  }

  // Lifetime access flag is unrelated to balance crediting and isn't covered
  // by the RPC — keep the manual update. Resolve the profile id first (the
  // RPC may have auto-created it, so we look it up by whop_user_id).
  if (planName.toLowerCase().includes("lifetime") || productId?.includes("lifetime")) {
    const { data: profileForLifetime } = await sbAdmin
      .from("user_profiles")
      .select("id")
      .eq("whop_user_id", whopUserId)
      .maybeSingle()

    if (profileForLifetime) {
      await sbAdmin
        .from("user_profiles")
        .update({
          lifetime_access: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileForLifetime.id)

      console.log(`Granted lifetime access to user ${whopUserId}`)
    } else {
      console.error(`Cannot grant lifetime: profile not found for ${whopUserId}`)
    }
  }
}
