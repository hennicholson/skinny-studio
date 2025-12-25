import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// GET /api/saved-prompts - List user's saved prompts
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
    const category = searchParams.get("category")
    const favoritesOnly = searchParams.get("favorites") === "true"

    let query = sbAdmin
      .from("saved_prompts")
      .select("*")
      .eq("whop_user_id", whopUserId)
      .order("created_at", { ascending: false })

    if (category) {
      query = query.eq("category", category)
    }

    if (favoritesOnly) {
      query = query.eq("is_favorite", true)
    }

    const { data: prompts, error } = await query

    if (error) {
      console.error("Error fetching saved prompts:", error)
      return NextResponse.json({ error: "Failed to fetch prompts" }, { status: 500 })
    }

    return NextResponse.json({ prompts: prompts || [] })
  } catch (error) {
    console.error("Saved prompts API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// POST /api/saved-prompts - Save a new prompt
export async function POST(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    const body = await request.json()
    const { title, prompt, description, target_model, category, tags, skill_shortcuts } = body

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Prompt text is required" }, { status: 400 })
    }

    // Generate title if not provided
    const effectiveTitle = title?.trim() || prompt.slice(0, 50) + (prompt.length > 50 ? "..." : "")

    const { data: savedPrompt, error } = await sbAdmin
      .from("saved_prompts")
      .insert({
        whop_user_id: whopUserId,
        title: effectiveTitle,
        prompt: prompt.trim(),
        description: description?.trim() || null,
        target_model: target_model || null,
        category: category || "general",
        tags: tags || [],
        skill_shortcuts: skill_shortcuts || [],
      })
      .select()
      .single()

    if (error) {
      console.error("Error saving prompt:", error)
      return NextResponse.json({ error: "Failed to save prompt" }, { status: 500 })
    }

    return NextResponse.json({ prompt: savedPrompt })
  } catch (error) {
    console.error("Save prompt error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// PATCH /api/saved-prompts - Update a prompt (toggle favorite, edit, etc.)
export async function PATCH(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "Prompt ID is required" }, { status: 400 })
    }

    // Only allow certain fields to be updated
    const allowedUpdates: Record<string, any> = {}
    if (updates.title !== undefined) allowedUpdates.title = updates.title
    if (updates.prompt !== undefined) allowedUpdates.prompt = updates.prompt
    if (updates.description !== undefined) allowedUpdates.description = updates.description
    if (updates.target_model !== undefined) allowedUpdates.target_model = updates.target_model
    if (updates.category !== undefined) allowedUpdates.category = updates.category
    if (updates.tags !== undefined) allowedUpdates.tags = updates.tags
    if (updates.is_favorite !== undefined) allowedUpdates.is_favorite = updates.is_favorite
    if (updates.use_count !== undefined) allowedUpdates.use_count = updates.use_count

    allowedUpdates.updated_at = new Date().toISOString()

    const { data: updatedPrompt, error } = await sbAdmin
      .from("saved_prompts")
      .update(allowedUpdates)
      .eq("id", id)
      .eq("whop_user_id", whopUserId) // Ensure user owns this prompt
      .select()
      .single()

    if (error) {
      console.error("Error updating prompt:", error)
      return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 })
    }

    return NextResponse.json({ prompt: updatedPrompt })
  } catch (error) {
    console.error("Update prompt error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// DELETE /api/saved-prompts - Delete a prompt
export async function DELETE(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Prompt ID is required" }, { status: 400 })
    }

    const { error } = await sbAdmin
      .from("saved_prompts")
      .delete()
      .eq("id", id)
      .eq("whop_user_id", whopUserId) // Ensure user owns this prompt

    if (error) {
      console.error("Error deleting prompt:", error)
      return NextResponse.json({ error: "Failed to delete prompt" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete prompt error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
