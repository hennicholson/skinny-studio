// app/api/charge/route.ts
import { NextResponse } from "next/server";
import Whop from "@whop/sdk";
import { sbAdmin } from "@/lib/supabaseAdmin";
import { getWhopAuthFromHeaders } from "@/lib/whop";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const runtime = "nodejs";

function round2(n: number) {
  return Math.max(0, Math.round((n + Number.EPSILON) * 100) / 100);
}

// Initialize the new Whop SDK
const whopClient = new Whop({
  appID: process.env.NEXT_PUBLIC_WHOP_APP_ID ?? "",
  apiKey: process.env.WHOP_API_KEY ?? "",
});

export async function POST(request: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_WHOP_APP_ID || !process.env.WHOP_API_KEY) {
      return NextResponse.json({ error: "Whop configuration missing" }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_WHOP_COMPANY_ID) {
      return NextResponse.json({ error: "Whop company ID missing" }, { status: 500 });
    }

    let planId: number | undefined;
    let internalUserId: string | undefined;
    let experienceId: string | undefined;

    try {
      const body = await request.json();
      planId = body?.planId;
      internalUserId = body?.userId;
      experienceId = body?.experienceId;
    } catch {}

    if (!planId) return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    if (!internalUserId || !UUID_RE.test(String(internalUserId))) {
      return NextResponse.json({ error: "Missing/invalid internal user UUID" }, { status: 400 });
    }

    // Look up the user_profile to get the whop_user_id for crediting
    const { data: userProfile, error: profileErr } = await sbAdmin
      .from("user_profiles")
      .select("id, whop_user_id")
      .eq("id", internalUserId)
      .maybeSingle();

    if (profileErr) {
      console.error("Error looking up user profile:", profileErr);
    }

    // --- Resolve Whop user ---
    // Try to get from headers first, then fall back to profile's whop_user_id
    let whopUserId: string | undefined;

    try {
      const { token, hintedId } = await getWhopAuthFromHeaders();
      whopUserId = hintedId;

      if (!whopUserId && token) {
        try {
          const parts = token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
            whopUserId = payload?.sub || payload?.user_id || payload?.id;
          }
        } catch {}
      }
    } catch (authError) {
      // No auth headers - this is OK if we have profile with whop_user_id
      console.log("No auth headers, will use profile whop_user_id if available");
    }

    // Use whop_user_id from profile if available, otherwise use the one from headers
    const profileWhopUserId = userProfile?.whop_user_id || whopUserId;

    if (!profileWhopUserId) {
      return NextResponse.json({ error: "Could not determine Whop user ID" }, { status: 400 });
    }

    // --- Load Plan ---
    const { data: plan, error: planErr } = await sbAdmin
      .from("topup_plans")
      .select("plan_id, name, credits, price, currency, status")
      .eq("plan_id", planId)
      .maybeSingle();

    if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });
    if (!plan || !plan.status) return NextResponse.json({ error: "Plan not found or inactive" }, { status: 404 });

    const basePrice = Number(plan.price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return NextResponse.json({ error: "Invalid plan price" }, { status: 400 });
    }

    const amount = round2(basePrice);
    const currency = String(plan.currency || "usd").toLowerCase();

    console.log("Creating checkout configuration for:", {
      whopUserId,
      profileWhopUserId,
      internalUserId,
      planId: plan.plan_id,
      amount,
      currency,
    });

    // --- Create Checkout Configuration using new REST API ---
    const checkoutConfig = await whopClient.checkoutConfigurations.create({
      plan: {
        company_id: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID,
        initial_price: amount,
        plan_type: "one_time",
        currency: currency as any,
        title: plan.name || `Top-up ${plan.credits} credits`,
        description: `Add ${plan.credits} credits to your balance`,
      },
      metadata: {
        internal_user_id: internalUserId,
        whop_user_id: profileWhopUserId,  // Use profile's whop_user_id for crediting
        profile_id: internalUserId,  // Store the user_profiles.id for webhook
        plan_id: String(plan.plan_id),
        plan_name: plan.name,
        credits: String(plan.credits),
        price: String(basePrice),
        currency: plan.currency || "usd",
        experienceId: experienceId ?? "",
      },
    });

    console.log("Checkout configuration created:", checkoutConfig);

    if (!checkoutConfig?.id || !checkoutConfig?.plan?.id) {
      console.error("Invalid checkout config response:", checkoutConfig);
      return NextResponse.json({ error: "Failed to create checkout configuration" }, { status: 500 });
    }

    // Return the format expected by iframeSdk.inAppPurchase()
    return NextResponse.json({
      id: checkoutConfig.id,
      planId: checkoutConfig.plan.id,
    });
  } catch (err: any) {
    console.error("Error creating charge:", err?.message || err);
    console.error("Full error:", JSON.stringify(err, null, 2));
    return NextResponse.json({ error: err?.message || "Failed to create charge" }, { status: 500 });
  }
}
