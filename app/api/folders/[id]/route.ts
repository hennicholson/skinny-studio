import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/folders/[id] - Get a folder with its generations
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    // Get folder (verify ownership)
    const { data: folder, error } = await sbAdmin
      .from("library_folders")
      .select("*")
      .eq("id", id)
      .eq("whop_user_id", whopUserId)
      .single()

    if (error || !folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    // Get generations in this folder
    const { data: generations, error: genError } = await sbAdmin
      .from("generations")
      .select(`
        id,
        prompt,
        output_urls,
        model_slug,
        model_category,
        parameters,
        cost_cents,
        created_at,
        folder_id,
        studio_models (
          id,
          slug,
          name,
          category
        )
      `)
      .eq("folder_id", id)
      .eq("whop_user_id", whopUserId)
      .eq("replicate_status", "succeeded")
      .not("output_urls", "eq", "{}")
      .order("created_at", { ascending: false })

    if (genError) {
      console.error("Error fetching folder generations:", genError)
    }

    return NextResponse.json({
      folder: {
        ...folder,
        generation_count: generations?.length || 0,
      },
      generations: generations || [],
    })
  } catch (error) {
    console.error("Get folder error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// PATCH /api/folders/[id] - Update folder (rename, change icon/color)
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    // Verify ownership
    const { data: existing } = await sbAdmin
      .from("library_folders")
      .select("id")
      .eq("id", id)
      .eq("whop_user_id", whopUserId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    const body = await request.json()
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json({ error: "Invalid folder name" }, { status: 400 })
      }
      updates.name = body.name.trim()
    }

    if (body.icon !== undefined) updates.icon = body.icon
    if (body.color !== undefined) updates.color = body.color
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order
    if (body.folder_type !== undefined) {
      const validFolderTypes = ['general', 'character', 'world', 'object', 'style']
      if (validFolderTypes.includes(body.folder_type)) {
        updates.folder_type = body.folder_type
      }
    }

    const { data: folder, error } = await sbAdmin
      .from("library_folders")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating folder:", error)
      return NextResponse.json({ error: "Failed to update folder" }, { status: 500 })
    }

    return NextResponse.json({ folder })
  } catch (error) {
    console.error("Update folder error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// DELETE /api/folders/[id] - Delete folder (generations become unfiled)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    // Verify ownership
    const { data: existing } = await sbAdmin
      .from("library_folders")
      .select("id")
      .eq("id", id)
      .eq("whop_user_id", whopUserId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    // Delete folder (generations will have folder_id set to NULL due to ON DELETE SET NULL)
    const { error } = await sbAdmin
      .from("library_folders")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting folder:", error)
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete folder error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
