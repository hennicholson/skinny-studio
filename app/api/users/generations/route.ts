import { NextResponse } from "next/server"
import {
  getWhopAuthFromHeaders,
  verifyWhopTokenAndGetProfile,
  hasWhopAuth,
} from "@/lib/whop"
import { sbAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    // Check if we have auth headers
    const hasAuth = await hasWhopAuth()
    if (!hasAuth) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      )
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    // Parse query params
    const url = new URL(request.url)
    const status = url.searchParams.get("status") || undefined // 'succeeded', 'failed', 'starting', 'processing'
    const limit = parseInt(url.searchParams.get("limit") || "50")
    const offset = parseInt(url.searchParams.get("offset") || "0")

    // Build query - fetch from generations table
    let query = sbAdmin
      .from("generations")
      .select("*", { count: "exact" })
      .eq("whop_user_id", whop.id)
      .order("created_at", { ascending: false })

    // Apply status filter
    if (status) {
      query = query.eq("replicate_status", status)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: generations, error, count } = await query

    if (error) {
      console.error("Error fetching generations:", error)
      return NextResponse.json(
        { error: "Failed to fetch generations" },
        { status: 500 }
      )
    }

    // Calculate summary stats
    const { data: statsData } = await sbAdmin
      .from("generations")
      .select("replicate_status, model_category, cost_cents")
      .eq("whop_user_id", whop.id)

    let totalGenerations = 0
    let succeededCount = 0
    let failedCount = 0
    let pendingCount = 0
    let imageCount = 0
    let videoCount = 0
    let totalCostCents = 0

    if (statsData) {
      totalGenerations = statsData.length
      for (const gen of statsData) {
        if (gen.replicate_status === 'succeeded') {
          succeededCount++
          totalCostCents += gen.cost_cents || 0
        } else if (gen.replicate_status === 'failed') {
          failedCount++
        } else {
          pendingCount++
        }

        if (gen.model_category === 'video') {
          videoCount++
        } else {
          imageCount++
        }
      }
    }

    return NextResponse.json({
      generations: generations || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
      summary: {
        totalGenerations,
        succeededCount,
        failedCount,
        pendingCount,
        imageCount,
        videoCount,
        totalCostCents,
      },
    })
  } catch (e: unknown) {
    console.error("Error in /api/users/generations:", e)

    if (e instanceof Error) {
      return NextResponse.json(
        { error: e.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
