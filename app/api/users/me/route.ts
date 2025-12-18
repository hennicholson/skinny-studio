import { NextResponse } from "next/server";
import {
  getWhopAuthFromHeaders,
  verifyWhopTokenAndGetProfile,
  hasWhopAuth,
} from "@/lib/whop";
import { sbAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Check if we have auth headers
    const hasAuth = await hasWhopAuth();
    if (!hasAuth) {
      // Return empty state for unauthenticated requests
      return NextResponse.json({
        user: null,
        whop: null,
        profile: null,
        error: "Not authenticated",
      });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);

    // Get or create user profile from user_profiles table
    let { data: profile, error: profileError } = await sbAdmin
      .from("user_profiles")
      .select("*")
      .eq("whop_user_id", whop.id)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
    }

    // Create profile if doesn't exist
    if (!profile) {
      // Check for active campaigns for new users
      let campaignCredits = 0;
      let activeCampaign = null;

      const { data: campaigns } = await sbAdmin
        .from("credit_campaigns")
        .select("*")
        .eq("is_active", true)
        .eq("applies_to", "new_users")
        .limit(1);

      if (campaigns && campaigns.length > 0) {
        activeCampaign = campaigns[0];
        campaignCredits = activeCampaign.credit_amount_cents || 0;
        console.log(`Applying campaign "${activeCampaign.name}" to new user: ${campaignCredits} cents`);
      }

      const { data: newProfile, error: createError } = await sbAdmin
        .from("user_profiles")
        .insert({
          whop_user_id: whop.id,
          whop_unique_id: whop.unique_id,
          email: whop.email,
          username: whop.username,
          balance_cents: campaignCredits,
          lifetime_access: false,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating profile:", createError);
      } else {
        profile = newProfile;

        // Record the campaign grant if credits were applied
        if (activeCampaign && campaignCredits > 0 && profile) {
          await sbAdmin.from("campaign_grants").insert({
            campaign_id: activeCampaign.id,
            user_id: profile.id,
            amount_cents: campaignCredits,
          });

          // Create a gift notification so user sees the welcome bonus
          await sbAdmin.from("credit_gifts").insert({
            recipient_user_id: profile.id,
            amount_cents: campaignCredits,
            message: activeCampaign.description || `Welcome! Here's your ${activeCampaign.name} bonus!`,
            sent_by: "system",
          });

          console.log(`Granted campaign "${activeCampaign.name}" to new user ${profile.id}`);
        }
      }
    } else {
      // Update profile with latest Whop info if changed
      if (
        (whop.email && profile.email !== whop.email) ||
        (whop.username && profile.username !== whop.username)
      ) {
        await sbAdmin
          .from("user_profiles")
          .update({
            email: whop.email || profile.email,
            username: whop.username || profile.username,
            whop_unique_id: whop.unique_id || profile.whop_unique_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.id);
      }
    }

    // Also check legacy users table for backwards compatibility
    let { data: user } = await sbAdmin
      .from("users")
      .select("*")
      .eq("whop_user_id", whop.id)
      .maybeSingle();

    // Get recent generations count
    const { count: recentGenerations } = await sbAdmin
      .from("generations")
      .select("*", { count: "exact", head: true })
      .eq("whop_user_id", whop.id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Get total generations count
    const { count: totalGenerations } = await sbAdmin
      .from("generations")
      .select("*", { count: "exact", head: true })
      .eq("whop_user_id", whop.id);

    return NextResponse.json({
      user,
      whop,
      profile: profile
        ? {
            ...profile,
            recentGenerations: recentGenerations || 0,
            totalGenerations: totalGenerations || 0,
          }
        : null,
    });
  } catch (e: unknown) {
    console.error("Error in /api/users/me:", e);

    if (e instanceof Error) {
      return NextResponse.json(
        { error: e.message, stack: e.stack, name: e.name },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
