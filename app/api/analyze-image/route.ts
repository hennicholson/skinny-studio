import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'
import { getEffectiveGeminiApiKey } from '@/lib/platform-settings'

export const runtime = 'nodejs'
export const maxDuration = 60

// Download image and convert to base64
async function imageUrlToBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = response.headers.get('content-type') || 'image/jpeg'

  return { base64, mimeType }
}

// Purpose-specific analysis prompts
const PURPOSE_PROMPTS: Record<string, string> = {
  reference: `Analyze this reference image for AI image generation. Describe:
- Main subject(s) and their key visual characteristics
- Color palette and lighting style
- Composition and framing
- Art style or photographic technique
- Mood and atmosphere
- Any distinctive visual elements that should be preserved

Keep the description concise but specific enough to guide consistent image generation.`,

  starting_frame: `Analyze this starting frame for video generation. Describe:
- Scene composition and camera angle
- Subject(s) position and pose
- Background elements and setting
- Lighting conditions and mood
- Color grading and visual style
- Key elements that should remain consistent throughout the video

Be specific about spatial relationships and visual details.`,

  edit_target: `Analyze this image that will be edited. Describe:
- Main subject(s) and their characteristics
- Current composition and layout
- Elements that might be modified or replaced
- Background and context
- Style and quality of the original
- Areas of interest for potential edits

Be specific about what exists so edits can be precisely targeted.`,

  last_frame: `Analyze this end frame for video generation. Describe:
- Final scene composition
- Subject(s) final position and state
- How it differs from a potential starting point
- Mood and atmosphere of the conclusion
- Key visual elements that define this as an ending

Focus on elements that should be reached by the end of the video.`,

  analyze: `Provide a comprehensive analysis of this image:
- Subject matter and main focus
- Visual style and artistic approach
- Color palette and lighting
- Composition and framing
- Mood, tone, and atmosphere
- Notable details and unique elements
- Technical quality and characteristics

This analysis will help inform AI-assisted creative decisions.`,
}

// POST /api/analyze-image - Analyze an image with Gemini vision
export async function POST(request: NextRequest) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { imageUrl, base64: inputBase64, mimeType: inputMimeType, purpose, conversationId } = body

    // Validate input - need either URL or base64
    if (!imageUrl && !inputBase64) {
      return NextResponse.json({ error: 'Image URL or base64 data required' }, { status: 400 })
    }

    // Check cache - first by conversationId (exact match), then by imageUrl + purpose (cross-conversation)
    if (imageUrl) {
      // Try exact conversation match first
      if (conversationId) {
        const { data: cached } = await sbAdmin
          .from('image_analyses')
          .select('analysis_text')
          .eq('conversation_id', conversationId)
          .eq('image_url', imageUrl)
          .maybeSingle()

        if (cached?.analysis_text) {
          console.log('[analyze-image] Cache hit (conversation) for image:', imageUrl.slice(0, 50))
          return NextResponse.json({
            success: true,
            analysis: cached.analysis_text,
            cached: true,
          })
        }
      }

      // Fallback: Check for any cached analysis with same URL and purpose (reuse across conversations)
      // This helps with Skinny Hub images that users reuse in different conversations
      const { data: crossConvCached } = await sbAdmin
        .from('image_analyses')
        .select('analysis_text')
        .eq('image_url', imageUrl)
        .eq('purpose', purpose || 'analyze')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (crossConvCached?.analysis_text) {
        console.log('[analyze-image] Cache hit (cross-conversation) for image:', imageUrl.slice(0, 50))
        return NextResponse.json({
          success: true,
          analysis: crossConvCached.analysis_text,
          cached: true,
        })
      }

      // Last cache layer before burning Gemini credits: check whether the
      // URL belongs to a Skinny Hub generation that already has a stored
      // analysis on its `output_metadata.analysis.text`. We persist this
      // on first analysis (see bottom of route) so subsequent reuses —
      // across canvases, conversations, or after image_analyses TTL — read
      // from the asset's own metadata for free.
      const { data: hubGen } = await sbAdmin
        .from('generations')
        .select('id, output_metadata')
        .contains('output_urls', [imageUrl])
        .maybeSingle()
      const hubAnalysis = (hubGen?.output_metadata as Record<string, any> | undefined)
        ?.analysis?.text as string | undefined
      if (hubAnalysis) {
        console.log('[analyze-image] Cache hit (hub metadata) for image:', imageUrl.slice(0, 50))
        // Backfill the image_analyses table so the next lookup short-circuits
        // even earlier (and we don't repeat this scan for the same URL).
        if (conversationId) {
          await sbAdmin
            .from('image_analyses')
            .upsert(
              {
                whop_user_id: whop.id,
                conversation_id: conversationId,
                image_url: imageUrl,
                purpose: purpose || 'analyze',
                analysis_text: hubAnalysis,
                model_used: 'gemini-2.5-flash',
                token_count: null,
              },
              { onConflict: 'conversation_id,image_url' },
            )
            .then(({ error }) => {
              if (error) console.error('[analyze-image] backfill insert error:', error)
            })
        }
        return NextResponse.json({
          success: true,
          analysis: hubAnalysis,
          cached: true,
          source: 'hub_metadata',
        })
      }
    }

    // Get effective Gemini API key
    let effectiveApiKey: string
    try {
      effectiveApiKey = await getEffectiveGeminiApiKey()
    } catch {
      return NextResponse.json({
        error: 'Gemini API key not configured',
        code: 'NO_API_KEY'
      }, { status: 500 })
    }

    // Get image data
    let base64: string
    let mimeType: string

    if (inputBase64) {
      base64 = inputBase64
      mimeType = inputMimeType || 'image/jpeg'
    } else {
      const imageData = await imageUrlToBase64(imageUrl)
      base64 = imageData.base64
      mimeType = imageData.mimeType
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(effectiveApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Get purpose-specific prompt
    const analysisPrompt = PURPOSE_PROMPTS[purpose || 'analyze'] || PURPOSE_PROMPTS.analyze

    // Call Gemini with vision
    const result = await model.generateContent([
      analysisPrompt,
      {
        inlineData: {
          data: base64,
          mimeType,
        }
      }
    ])

    const response = await result.response
    const analysisText = response.text()

    // Get token count for logging
    const tokenCount = response.usageMetadata?.totalTokenCount || null

    // Cache result if conversationId provided
    if (conversationId && imageUrl) {
      const { error: insertError } = await sbAdmin
        .from('image_analyses')
        .upsert({
          whop_user_id: whop.id,
          conversation_id: conversationId,
          image_url: imageUrl,
          purpose: purpose || 'analyze',
          analysis_text: analysisText,
          model_used: 'gemini-2.5-flash',
          token_count: tokenCount,
        }, {
          onConflict: 'conversation_id,image_url',
        })

      if (insertError) {
        console.error('[analyze-image] Failed to cache analysis:', insertError)
        // Continue - caching failure shouldn't block the response
      } else {
        console.log('[analyze-image] Cached analysis for image:', imageUrl.slice(0, 50))
      }
    }

    // Track Gemini usage if we have a gemini_usage table
    try {
      await sbAdmin.from('gemini_usage').insert({
        whop_user_id: whop.id,
        model: 'gemini-2.5-flash',
        feature: 'image_analysis',
        input_tokens: response.usageMetadata?.promptTokenCount || 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: tokenCount || 0,
      })
    } catch {
      // Gemini usage tracking is optional
    }

    // Save analysis to the generation record so it persists with the image
    // This allows Skinny Hub images to have their analysis attached when fetched
    if (imageUrl) {
      try {
        const { data: generation } = await sbAdmin
          .from('generations')
          .select('id, output_metadata')
          .contains('output_urls', [imageUrl])
          .maybeSingle()

        if (generation) {
          const existingMetadata = (generation.output_metadata as Record<string, any>) || {}
          await sbAdmin
            .from('generations')
            .update({
              output_metadata: {
                ...existingMetadata,
                analysis: {
                  text: analysisText,
                  purpose: purpose || 'analyze',
                  analyzed_at: new Date().toISOString(),
                }
              }
            })
            .eq('id', generation.id)
          console.log('[analyze-image] Saved analysis to generation:', generation.id)
        }
      } catch (saveError) {
        console.error('[analyze-image] Failed to save analysis to generation:', saveError)
        // Continue - this shouldn't block the response
      }
    }

    return NextResponse.json({
      success: true,
      analysis: analysisText,
      tokenCount,
      cached: false,
    })

  } catch (error) {
    console.error('[analyze-image] Error:', error)
    return NextResponse.json({ error: 'Failed to analyze image' }, { status: 500 })
  }
}
