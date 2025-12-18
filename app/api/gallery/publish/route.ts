import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// POST /api/gallery/publish - Publish a generation to the gallery
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
    const { generationId, title, description, tags } = body

    if (!generationId) {
      return NextResponse.json({ error: "Generation ID required" }, { status: 400 })
    }

    // Check if generation exists and belongs to user
    const { data: generation, error: genError } = await sbAdmin
      .from("generations")
      .select(`
        id,
        whop_user_id,
        prompt,
        output_urls,
        model_slug,
        model_category,
        created_at,
        studio_models (
          id,
          slug,
          name,
          category
        )
      `)
      .eq("id", generationId)
      .single()

    if (genError || !generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 })
    }

    // Verify ownership
    if (generation.whop_user_id !== whopUserId) {
      return NextResponse.json({ error: "You can only publish your own generations" }, { status: 403 })
    }

    // Check if already published
    const { data: existingGallery } = await sbAdmin
      .from("gallery")
      .select("id")
      .eq("generation_id", generationId)
      .single()

    if (existingGallery) {
      return NextResponse.json({
        error: "Already published",
        galleryId: existingGallery.id
      }, { status: 400 })
    }

    // Get user_id from user_profiles if available
    const { data: userProfile } = await sbAdmin
      .from("user_profiles")
      .select("id")
      .eq("whop_user_id", whopUserId)
      .single()

    // Create gallery entry
    const galleryEntry = {
      generation_id: generationId,
      whop_user_id: whopUserId,
      user_id: userProfile?.id || null,
      title: title || generation.prompt?.slice(0, 100) || "Untitled",
      description: description || generation.prompt || "",
      tags: tags || [],
      like_count: 0,
      view_count: 0,
      remix_count: 0,
      is_featured: false,
      is_hidden: false,
    }

    const { data: newGalleryItem, error: insertError } = await sbAdmin
      .from("gallery")
      .insert(galleryEntry)
      .select("id")
      .single()

    if (insertError) {
      console.error("Error publishing to gallery:", insertError)
      return NextResponse.json({ error: "Failed to publish" }, { status: 500 })
    }

    // Mark generation as public
    await sbAdmin
      .from("generations")
      .update({ is_public: true })
      .eq("id", generationId)

    return NextResponse.json({
      success: true,
      galleryId: newGalleryItem.id,
      message: "Published to Creator Gallery!",
    })
  } catch (error) {
    console.error("Publish API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
