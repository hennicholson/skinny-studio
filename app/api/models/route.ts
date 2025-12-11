import { NextResponse } from "next/server"
import { sbAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

// GET /api/models - Fetch all active studio models
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category") // image, video, audio, llm

    let query = sbAdmin
      .from("studio_models")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })

    if (category) {
      query = query.eq("category", category)
    }

    const { data: models, error } = await query

    if (error) {
      console.error("Error fetching models:", error)
      return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 })
    }

    // Group models by category
    const grouped = {
      image: models?.filter(m => m.category === 'image') || [],
      video: models?.filter(m => m.category === 'video') || [],
      audio: models?.filter(m => m.category === 'audio') || [],
      llm: models?.filter(m => m.category === 'llm') || [],
    }

    return NextResponse.json({
      models: models || [],
      grouped,
    })
  } catch (error) {
    console.error("Models API error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
