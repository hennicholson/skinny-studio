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

    // Verify signature if secret is configured
    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(body, signature, webhookSecret)
      if (!isValid) {
        console.error("Invalid webhook signature")
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    const event = JSON.parse(body)
    const eventType = event.action || event.event || "unknown"

    console.log("Whop webhook received:", eventType)

    // Log webhook event
    await sbAdmin.from("webhook_events").insert({
      event_source: "whop",
      event_id: event.id || null,
      event_type: eventType,
      signature_valid: !!signature,
      payload: event,
      processed: false,
    })

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

  // Check if we have metadata from checkout configuration (in-app purchase)
  // The metadata contains the whop_user_id and credits from the charge route
  let whopUserId: string
  let profileId: string | null = null

  if (metadata.whop_user_id) {
    // Use the whop_user_id from metadata (set during checkout creation)
    whopUserId = metadata.whop_user_id
    profileId = metadata.profile_id || null
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

  // Get or create user profile
  let { data: profile } = await sbAdmin
    .from("user_profiles")
    .select("*")
    .eq("whop_user_id", whopUserId)
    .maybeSingle()

  // If not found by whop_user_id and we have profile_id, try that
  if (!profile && profileId) {
    const { data: profileById } = await sbAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", profileId)
      .maybeSingle()
    profile = profileById
  }

  if (!profile) {
    // Create profile
    const { data: newProfile, error } = await sbAdmin
      .from("user_profiles")
      .insert({
        whop_user_id: whopUserId,
        whop_unique_id: userId,
        balance_cents: 0,
        lifetime_access: false,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating profile:", error)
      return
    }
    profile = newProfile
  }

  // Add credits
  if (creditsToAdd > 0) {
    const newBalance = (profile.balance_cents || 0) + creditsToAdd

    await sbAdmin
      .from("user_profiles")
      .update({
        balance_cents: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)

    // Log transaction
    await sbAdmin.from("credit_transactions").insert({
      user_id: whopUserId,
      type: "topup",
      amount: creditsToAdd,
      amount_credited: creditsToAdd,
      app_name: "Skinny Studio",
      task: planName,
      status: "completed",
      external_ref: event.id,
      metadata: { event_type: event.action, plan_id: planId, product_id: productId },
    })

    console.log(`Added ${creditsToAdd} cents to user ${whopUserId}, new balance: ${newBalance}`)
  }

  // Check if this is a lifetime access purchase
  if (planName.toLowerCase().includes("lifetime") || productId?.includes("lifetime")) {
    await sbAdmin
      .from("user_profiles")
      .update({
        lifetime_access: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)

    console.log(`Granted lifetime access to user ${whopUserId}`)
  }
}
