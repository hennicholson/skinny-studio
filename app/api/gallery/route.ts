import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from "@/lib/whop"

export const runtime = "nodejs"

// Span patterns for bento grid - featured items get larger spans
const SPAN_PATTERNS = [
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
  "col-span-2 row-span-2", // Every 3rd item is larger
  "col-span-1 row-span-1",
  "col-span-1 row-span-2", // Tall
  "col-span-2 row-span-1", // Wide
]

// GET /api/gallery - Fetch public gallery items with real stats
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")
    const featured = searchParams.get("featured") === "true"
    const sort = searchParams.get("sort") || "recent" // recent, popular, views

    // Optionally get current user's likes
    let userLikes: string[] = []
    let currentUserId: string | null = null

    try {
      const isAuthenticated = await hasWhopAuth()
      if (isAuthenticated) {
        const { token, hintedId } = await getWhopAuthFromHeaders()
        const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
        currentUserId = whop.id

        // Get user's likes
        const { data: likes } = await sbAdmin
          .from("gallery_likes")
          .select("gallery_id")
          .eq("whop_user_id", currentUserId)

        userLikes = likes?.map(l => l.gallery_id) || []
      }
    } catch {
      // Not authenticated, continue without user likes
    }

    // Build query for gallery items
    let query = sbAdmin
      .from("gallery")
      .select(`
        id,
        generation_id,
        whop_user_id,
        title,
        description,
        image_url,
        tags,
        view_count,
        like_count,
        remix_count,
        is_featured,
        is_hidden,
        created_at,
        updated_at,
        generations (
          id,
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
        ),
        user_profiles!gallery_user_id_fkey (
          id,
          username,
          whop_user_id
        )
      `)
      .eq("is_hidden", false)
      .range(offset, offset + limit - 1)

    // Filter featured only if requested
    if (featured) {
      query = query.eq("is_featured", true)
    }

    // Sort order
    switch (sort) {
      case "popular":
        query = query.order("like_count", { ascending: false })
        break
      case "views":
        query = query.order("view_count", { ascending: false })
        break
      default:
        query = query.order("created_at", { ascending: false })
    }

    const { data: galleryItems, error, count } = await query

    if (error) {
      console.error("Error fetching gallery:", error)
      return NextResponse.json({ error: "Failed to fetch gallery" }, { status: 500 })
    }

    // Transform data for frontend
    const items = (galleryItems || []).map((item, index) => {
      const generation = item.generations as any
      const creator = item.user_profiles as any

      // Get image URL from generation, or fall back to direct image_url (for seeded items)
      const imageUrl = generation?.output_urls?.[0] || item.image_url || ""

      // Assign span pattern based on index and featured status
      let span = SPAN_PATTERNS[index % SPAN_PATTERNS.length]
      if (item.is_featured) {
        span = "col-span-2 row-span-2" // Featured items always large
      }

      return {
        id: item.id,
        generationId: item.generation_id,
        imageUrl,
        prompt: generation?.prompt || item.title || "Creative generation",
        title: item.title,
        description: item.description,
        model: {
          slug: generation?.model_slug || generation?.studio_models?.slug || "unknown",
          name: generation?.studio_models?.name || "Skinny Studio",
          category: generation?.model_category || generation?.studio_models?.category || "image",
        },
        creator: {
          id: creator?.whop_user_id || item.whop_user_id,
          username: creator?.username || "creator",
        },
        stats: {
          likes: item.like_count || 0,
          views: item.view_count || 0,
          remixes: item.remix_count || 0,
        },
        isFeatured: item.is_featured || false,
        isLiked: userLikes.includes(item.id),
        tags: item.tags || [],
        createdAt: item.created_at,
        span,
      }
    })

    return NextResponse.json({
      items,
      count: count || items.length,
      offset,
      limit,
      userLikes,
    })
  } catch (error) {
    console.error("Gallery API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
