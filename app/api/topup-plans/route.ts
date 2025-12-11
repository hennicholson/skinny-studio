import { NextResponse } from "next/server";
import { sbAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data: plans, error } = await sbAdmin
      .from("topup_plans")
      .select("plan_id, name, description, credits, price, currency, slug, whop_plan_id, display_order")
      .eq("status", true)
      .order("display_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ plans: plans || [] });
  } catch (err: any) {
    console.error("Error fetching topup plans:", err);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}
