import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// GET /api/generations - List user's generations
export async function GET(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category") // image, video, audio, llm
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    // Check if caller wants to include pending generations
    const includePending = searchParams.get("includePending") === "true"

    let query = sbAdmin
      .from("generations")
      .select(`
        *,
        studio_models (
          id,
          slug,
          name,
          category
        )
      `)
      .eq("whop_user_id", whopUserId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    // By default, only return successful generations with actual output
    if (!includePending) {
      query = query
        .eq("replicate_status", "succeeded")
        .not("output_urls", "is", null)
    }

    if (category) {
      query = query.eq("model_category", category)
    }

    const { data: generations, error, count } = await query

    if (error) {
      console.error("Error fetching generations:", error)
      return NextResponse.json({ error: "Failed to fetch generations" }, { status: 500 })
    }

    return NextResponse.json({
      generations: generations || [],
      count: count || 0,
      offset,
      limit,
    })
  } catch (error) {
    console.error("Generations API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
