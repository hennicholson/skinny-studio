import { NextResponse } from "next/server"
import {
  getWhopAuthFromHeaders,
  verifyWhopTokenAndGetProfile,
  hasWhopAuth,
} from "@/lib/whop"
import { sbAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

interface TransactionFilters {
  type?: string
  task?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

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
    const type = url.searchParams.get("type") || undefined
    const task = url.searchParams.get("task") || undefined
    const startDate = url.searchParams.get("startDate") || undefined
    const endDate = url.searchParams.get("endDate") || undefined
    const limit = parseInt(url.searchParams.get("limit") || "50")
    const offset = parseInt(url.searchParams.get("offset") || "0")

    // Build query
    let query = sbAdmin
      .from("credit_transactions")
      .select("*", { count: "exact" })
      .eq("user_id", whop.id)
      .order("created_at", { ascending: false })

    // Apply filters
    if (type) {
      query = query.eq("type", type)
    }
    if (task) {
      query = query.eq("task", task)
    }
    if (startDate) {
      query = query.gte("created_at", startDate)
    }
    if (endDate) {
      query = query.lte("created_at", endDate)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: transactions, error, count } = await query

    if (error) {
      console.error("Error fetching transactions:", error)
      return NextResponse.json(
        { error: "Failed to fetch transactions" },
        { status: 500 }
      )
    }

    // Calculate summary stats
    const { data: summaryData } = await sbAdmin
      .from("credit_transactions")
      .select("type, amount")
      .eq("user_id", whop.id)

    let totalSpent = 0
    let totalAdded = 0
    let imageGenerations = 0
    let videoGenerations = 0

    if (summaryData) {
      for (const tx of summaryData) {
        if (tx.type === "usage" && tx.amount < 0) {
          totalSpent += Math.abs(tx.amount)
        } else if (tx.type === "topup" || tx.type === "purchase") {
          totalAdded += tx.amount
        }
      }
    }

    // Count generations by type
    const { data: genStats } = await sbAdmin
      .from("credit_transactions")
      .select("task")
      .eq("user_id", whop.id)
      .eq("type", "usage")

    if (genStats) {
      for (const tx of genStats) {
        if (tx.task === "video_generation") {
          videoGenerations++
        } else if (tx.task === "image_generation" || tx.task === "generate") {
          imageGenerations++
        }
      }
    }

    return NextResponse.json({
      transactions: transactions || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
      summary: {
        totalSpentCents: totalSpent,
        totalAddedCents: totalAdded,
        imageGenerations,
        videoGenerations,
        totalGenerations: imageGenerations + videoGenerations,
      },
    })
  } catch (e: unknown) {
    console.error("Error in /api/users/transactions:", e)

    if (e instanceof Error) {
      return NextResponse.json(
        { error: e.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
