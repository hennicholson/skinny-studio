import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// POST /api/gallery/[id]/like - Like a gallery item
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
    const galleryId = params.id

    // Check if gallery item exists
    const { data: galleryItem, error: fetchError } = await sbAdmin
      .from("gallery")
      .select("id, like_count")
      .eq("id", galleryId)
      .single()

    if (fetchError || !galleryItem) {
      return NextResponse.json({ error: "Gallery item not found" }, { status: 404 })
    }

    // Check if already liked
    const { data: existingLike } = await sbAdmin
      .from("gallery_likes")
      .select("id")
      .eq("gallery_id", galleryId)
      .eq("whop_user_id", whopUserId)
      .single()

    if (existingLike) {
      return NextResponse.json({
        error: "Already liked",
        liked: true,
        likeCount: galleryItem.like_count
      }, { status: 400 })
    }

    // Get user_id from user_profiles if available
    const { data: userProfile } = await sbAdmin
      .from("user_profiles")
      .select("id")
      .eq("whop_user_id", whopUserId)
      .single()

    // Insert like
    const { error: insertError } = await sbAdmin
      .from("gallery_likes")
      .insert({
        gallery_id: galleryId,
        whop_user_id: whopUserId,
        user_id: userProfile?.id || null,
      })

    if (insertError) {
      console.error("Error inserting like:", insertError)
      return NextResponse.json({ error: "Failed to like" }, { status: 500 })
    }

    // Increment like count
    const newLikeCount = (galleryItem.like_count || 0) + 1
    await sbAdmin
      .from("gallery")
      .update({ like_count: newLikeCount, updated_at: new Date().toISOString() })
      .eq("id", galleryId)

    return NextResponse.json({
      liked: true,
      likeCount: newLikeCount,
    })
  } catch (error) {
    console.error("Like API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// DELETE /api/gallery/[id]/like - Unlike a gallery item
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
    const galleryId = params.id

    // Check if gallery item exists
    const { data: galleryItem, error: fetchError } = await sbAdmin
      .from("gallery")
      .select("id, like_count")
      .eq("id", galleryId)
      .single()

    if (fetchError || !galleryItem) {
      return NextResponse.json({ error: "Gallery item not found" }, { status: 404 })
    }

    // Delete like
    const { error: deleteError } = await sbAdmin
      .from("gallery_likes")
      .delete()
      .eq("gallery_id", galleryId)
      .eq("whop_user_id", whopUserId)

    if (deleteError) {
      console.error("Error deleting like:", deleteError)
      return NextResponse.json({ error: "Failed to unlike" }, { status: 500 })
    }

    // Decrement like count (don't go below 0)
    const newLikeCount = Math.max(0, (galleryItem.like_count || 0) - 1)
    await sbAdmin
      .from("gallery")
      .update({ like_count: newLikeCount, updated_at: new Date().toISOString() })
      .eq("id", galleryId)

    return NextResponse.json({
      liked: false,
      likeCount: newLikeCount,
    })
  } catch (error) {
    console.error("Unlike API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
