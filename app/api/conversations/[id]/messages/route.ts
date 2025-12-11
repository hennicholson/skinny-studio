import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// POST /api/conversations/[id]/messages - Add a message to a conversation
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    const conversationId = params.id

    // Verify conversation ownership
    const { data: conversation } = await sbAdmin
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("whop_user_id", whopUserId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    const body = await request.json()
    const { role, content, generationId } = body

    if (!role || !content) {
      return NextResponse.json({ error: "Role and content required" }, { status: 400 })
    }

    // Insert message
    const { data: message, error } = await sbAdmin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
        generation_id: generationId || null,
      })
      .select()
      .single()

    if (error) {
      console.error("Error inserting message:", error)
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 })
    }

    // Update conversation's updated_at
    await sbAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)

    return NextResponse.json({ message })
  } catch (error) {
    console.error("Add message error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
