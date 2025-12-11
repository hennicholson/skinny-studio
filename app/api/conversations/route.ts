import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// GET /api/conversations - List user's conversations
export async function GET() {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    const { data: conversations, error } = await sbAdmin
      .from("conversations")
      .select(`
        id,
        title,
        model_id,
        model_category,
        is_archived,
        created_at,
        updated_at,
        studio_models (
          id,
          slug,
          name,
          category
        )
      `)
      .eq("whop_user_id", whopUserId)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Error fetching conversations:", error)
      return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 })
    }

    return NextResponse.json({ conversations: conversations || [] })
  } catch (error) {
    console.error("Conversations API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    // Get user profile ID
    const { data: profile } = await sbAdmin
      .from("user_profiles")
      .select("id")
      .eq("whop_user_id", whopUserId)
      .maybeSingle()

    const body = await request.json()
    const { title, modelId, modelCategory } = body

    const { data: conversation, error } = await sbAdmin
      .from("conversations")
      .insert({
        whop_user_id: whopUserId,
        user_id: profile?.id || null,
        title: title || "New Chat",
        model_id: modelId || null,
        model_category: modelCategory || null,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating conversation:", error)
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("Create conversation error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
