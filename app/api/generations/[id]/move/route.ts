import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/generations/[id]/move - Move generation to a folder
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    const body = await request.json()
    const { folder_id } = body

    // Verify generation belongs to user
    const { data: generation, error: genError } = await sbAdmin
      .from("generations")
      .select("id, whop_user_id, folder_id")
      .eq("id", id)
      .eq("whop_user_id", whopUserId)
      .single()

    if (genError || !generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 })
    }

    // If moving to a folder, verify folder belongs to user
    if (folder_id) {
      const { data: folder, error: folderError } = await sbAdmin
        .from("library_folders")
        .select("id")
        .eq("id", folder_id)
        .eq("whop_user_id", whopUserId)
        .single()

      if (folderError || !folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 })
      }
    }

    // Update generation's folder_id (null = unfiled/desktop)
    const { data: updated, error: updateError } = await sbAdmin
      .from("generations")
      .update({ folder_id: folder_id || null })
      .eq("id", id)
      .select("id, folder_id")
      .single()

    if (updateError) {
      console.error("Error moving generation:", updateError)
      return NextResponse.json({ error: "Failed to move generation" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      generation: updated,
    })
  } catch (error) {
    console.error("Move generation error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
