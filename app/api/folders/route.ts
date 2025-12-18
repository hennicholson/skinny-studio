import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// GET /api/folders - List user's folders with generation counts
export async function GET() {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    const whopUserId = whop.id

    // Get folders
    const { data: folders, error } = await sbAdmin
      .from("library_folders")
      .select("*")
      .eq("whop_user_id", whopUserId)
      .order("sort_order", { ascending: true })

    if (error) {
      console.error("Error fetching folders:", error)
      return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 })
    }

    // Get generation counts per folder
    const { data: counts, error: countError } = await sbAdmin
      .from("generations")
      .select("folder_id")
      .eq("whop_user_id", whopUserId)
      .eq("replicate_status", "succeeded")
      .not("output_urls", "eq", "{}")

    if (countError) {
      console.error("Error fetching folder counts:", countError)
    }

    // Calculate counts
    const countMap: Record<string, number> = {}
    let unfiledCount = 0

    if (counts) {
      for (const gen of counts) {
        if (gen.folder_id) {
          countMap[gen.folder_id] = (countMap[gen.folder_id] || 0) + 1
        } else {
          unfiledCount++
        }
      }
    }

    // Add counts to folders
    const foldersWithCounts = (folders || []).map(folder => ({
      ...folder,
      generation_count: countMap[folder.id] || 0,
    }))

    return NextResponse.json({
      folders: foldersWithCounts,
      unfiled_count: unfiledCount,
    })
  } catch (error) {
    console.error("Folders API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// POST /api/folders - Create a new folder
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
    const { name, icon, color, folder_type } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 })
    }

    // Validate folder_type if provided
    const validFolderTypes = ['general', 'character', 'world', 'object', 'style']
    const effectiveFolderType = folder_type && validFolderTypes.includes(folder_type)
      ? folder_type
      : 'general'

    // Get max sort_order for this user
    const { data: maxSort } = await sbAdmin
      .from("library_folders")
      .select("sort_order")
      .eq("whop_user_id", whopUserId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()

    const nextSortOrder = (maxSort?.sort_order ?? -1) + 1

    const { data: folder, error } = await sbAdmin
      .from("library_folders")
      .insert({
        whop_user_id: whopUserId,
        name: name.trim(),
        icon: icon || "folder",
        color: color || null,
        sort_order: nextSortOrder,
        folder_type: effectiveFolderType,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating folder:", error)
      return NextResponse.json({ error: "Failed to create folder" }, { status: 500 })
    }

    return NextResponse.json({ folder: { ...folder, generation_count: 0 } })
  } catch (error) {
    console.error("Create folder error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
