import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { resolveVideoCost, detectHasReferenceVideos } from '@/lib/video-pricing'

export const runtime = 'nodejs'

interface EstimateCostRequest {
  model: string
  duration?: number
  resolution?: string
  generateAudio?: boolean
  sequentialImageGeneration?: 'disabled' | 'auto'
  maxImages?: number
  /** Optional nested params blob. We inspect it for `reference_videos` to
   *  apply Seedance's video-in pricing premium during preview. */
  params?: Record<string, any>
}

export async function POST(request: Request) {
  try {
    // === AUTH CHECK ===
    let whopUserId: string | null = null
    let userBalance = 0
    let hasLifetimeAccess = false

    const isAuthenticated = await hasWhopAuth()

    if (isAuthenticated) {
      try {
        const { token, hintedId } = await getWhopAuthFromHeaders()
        const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
        whopUserId = whop.id

        // Get user profile
        const { data: profile } = await sbAdmin
          .from("user_profiles")
          .select("balance_cents, lifetime_access")
          .eq("whop_user_id", whopUserId)
          .maybeSingle()

        if (profile) {
          userBalance = profile.balance_cents || 0
          hasLifetimeAccess = profile.lifetime_access || false
        }
      } catch (authError) {
        console.log("Auth check failed:", authError)
      }
    }

    const body = await request.json() as EstimateCostRequest
    const { model, duration, resolution, generateAudio, sequentialImageGeneration, maxImages, params } = body

    if (!model) {
      return NextResponse.json({ error: 'Model is required' }, { status: 400 })
    }

    // Fetch model from database
    const { data: studioModel, error: modelError } = await sbAdmin
      .from("studio_models")
      .select("*")
      .eq("slug", model)
      .eq("is_active", true)
      .maybeSingle()

    if (modelError || !studioModel) {
      return NextResponse.json({ error: `Model not found: ${model}` }, { status: 400 })
    }

    // Calculate base cost
    let costCents = 0
    let effectiveDuration: number | undefined = duration
    let effectiveResolution: string | undefined = resolution
    let videoCostRate: number | undefined
    let videoInPremium = false

    if (studioModel.pricing_type === 'per_second') {
      const resolved = resolveVideoCost({
        model: studioModel,
        duration,
        resolution,
        generateAudio,
        hasReferenceVideos: detectHasReferenceVideos(params),
      })
      costCents = resolved.costCents
      effectiveDuration = resolved.effectiveDuration
      effectiveResolution = resolved.effectiveResolution
      videoCostRate = resolved.rateCentsPerSecond
      videoInPremium = resolved.videoInPremiumApplied
    } else {
      // Image model - flat rate
      costCents = studioModel.cost_per_run_cents || 0
    }

    // Calculate MAX possible cost for sequential generation
    let maxCostCents = costCents

    if (model === 'seedream-4.5' && sequentialImageGeneration === 'auto' && maxImages && maxImages > 1) {
      maxCostCents = costCents * Math.min(maxImages, 15)
    }

    // Determine if user can afford
    const affordable = hasLifetimeAccess || userBalance >= maxCostCents

    return NextResponse.json({
      model: studioModel.name,
      modelSlug: model,
      category: studioModel.category,
      pricingType: studioModel.pricing_type,
      costCents,
      maxCostCents,
      userBalance,
      hasLifetimeAccess,
      affordable,
      // Breakdown for display
      breakdown: {
        baseCostCents: costCents,
        ...(model === 'seedream-4.5' && sequentialImageGeneration === 'auto' && maxImages && maxImages > 1 && {
          sequentialMode: true,
          maxImages: Math.min(maxImages, 15),
          maxCostCents,
        }),
        ...(studioModel.pricing_type === 'per_second' && {
          duration: effectiveDuration,
          resolution: effectiveResolution,
          rateCentsPerSecond: videoCostRate,
          videoInPremium,
          // Legacy fields for backwards compat with consumers:
          costPerSecond: studioModel.cost_per_second_cents,
          resolutionMultiplier: studioModel.resolution_multipliers?.[effectiveResolution as string] || 1.0,
        }),
      },
    })

  } catch (error) {
    console.error('Estimate cost error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to estimate cost'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
