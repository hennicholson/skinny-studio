import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

// POST /api/analyze-image/check-cache - Check for cached image analysis
export async function POST(request: NextRequest) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ cached: false })
    }

    const { imageUrl, purpose } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ cached: false })
    }

    // Check for cached analysis by URL + purpose (cross-conversation)
    const { data: cached } = await sbAdmin
      .from('image_analyses')
      .select('analysis_text')
      .eq('image_url', imageUrl)
      .eq('purpose', purpose || 'analyze')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached?.analysis_text) {
      console.log('[check-cache] Cache hit for:', imageUrl.slice(0, 50))
      return NextResponse.json({
        cached: true,
        analysis: cached.analysis_text,
      })
    }

    // Fallback: Skinny Hub assets persist the analysis on the generation
    // row's output_metadata. Check there before reporting a miss so callers
    // skip the full /api/analyze-image roundtrip.
    const { data: hubGen } = await sbAdmin
      .from('generations')
      .select('output_metadata')
      .contains('output_urls', [imageUrl])
      .maybeSingle()
    const hubAnalysis = (hubGen?.output_metadata as Record<string, any> | undefined)
      ?.analysis?.text as string | undefined
    if (hubAnalysis) {
      console.log('[check-cache] Hub-metadata hit for:', imageUrl.slice(0, 50))
      return NextResponse.json({
        cached: true,
        analysis: hubAnalysis,
        source: 'hub_metadata',
      })
    }

    return NextResponse.json({ cached: false })
  } catch (error) {
    console.error('[check-cache] Error:', error)
    return NextResponse.json({ cached: false })
  }
}
