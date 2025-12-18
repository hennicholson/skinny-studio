import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// GET /api/conversations/[id] - Get conversation with messages and generations
export async function GET(
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

    // Get conversation
    const { data: conversation, error: convError } = await sbAdmin
      .from("conversations")
      .select(`
        *,
        studio_models (
          id,
          slug,
          name,
          category
        )
      `)
      .eq("id", conversationId)
      .eq("whop_user_id", whopUserId)
      .maybeSingle()

    if (convError) {
      console.error("Error fetching conversation:", convError)
      return NextResponse.json({ error: "Server error" }, { status: 500 })
    }

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    // Get messages
    const { data: messages, error: msgError } = await sbAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })

    if (msgError) {
      console.error("Error fetching messages:", msgError)
    }

    // Get generations for this conversation
    const { data: generations, error: genError } = await sbAdmin
      .from("generations")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })

    if (genError) {
      console.error("Error fetching generations:", genError)
    }

    return NextResponse.json({
      conversation,
      messages: messages || [],
      generations: generations || [],
    })
  } catch (error) {
    console.error("Get conversation error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// PATCH /api/conversations/[id] - Update conversation (title, archive, etc)
export async function PATCH(
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
    const body = await request.json()
    const { title, isArchived, modelId, modelCategory } = body

    // Verify ownership
    const { data: existing, error: existingError } = await sbAdmin
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("whop_user_id", whopUserId)
      .maybeSingle()

    if (existingError) {
      console.error("Error checking conversation ownership:", existingError)
      return NextResponse.json({ error: "Server error" }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    if (title !== undefined) updates.title = title
    if (isArchived !== undefined) updates.is_archived = isArchived
    if (modelId !== undefined) updates.model_id = modelId
    if (modelCategory !== undefined) updates.model_category = modelCategory

    const { data: conversation, error } = await sbAdmin
      .from("conversations")
      .update(updates)
      .eq("id", conversationId)
      .select()
      .single()

    if (error) {
      console.error("Error updating conversation:", error)
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("Update conversation error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// DELETE /api/conversations/[id] - Archive a conversation
export async function DELETE(
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

    // Soft delete (archive)
    const { error } = await sbAdmin
      .from("conversations")
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("whop_user_id", whopUserId)

    if (error) {
      console.error("Error archiving conversation:", error)
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete conversation error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
