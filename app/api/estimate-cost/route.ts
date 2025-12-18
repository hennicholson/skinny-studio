import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

interface EstimateCostRequest {
  model: string
  duration?: number
  resolution?: string
  generateAudio?: boolean
  sequentialImageGeneration?: 'disabled' | 'auto'
  maxImages?: number
}

// Calculate cost for video models (per-second pricing)
function calculateVideoCost(
  studioModel: any,
  duration: number,
  resolution: string,
  generateAudio?: boolean
): number {
  if (studioModel.pricing_type !== 'per_second') {
    return studioModel.cost_per_run_cents || 0
  }

  let baseCostPerSecond = studioModel.cost_per_second_cents || 0

  // Check for audio-based pricing in parameter_schema (Veo models)
  const paramSchema = studioModel.parameter_schema || {}
  const audioParam = paramSchema.generate_audio

  if (audioParam?.pricing) {
    const hasAudio = generateAudio !== false
    baseCostPerSecond = hasAudio
      ? audioParam.pricing.with_audio_cents_per_second
      : audioParam.pricing.without_audio_cents_per_second
  }

  // Apply resolution multiplier (for Wan 2.5 models)
  const multipliers = studioModel.resolution_multipliers || {}
  const resolutionMultiplier = multipliers[resolution] || 1.0

  return Math.ceil(baseCostPerSecond * duration * resolutionMultiplier)
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
    const { model, duration, resolution, generateAudio, sequentialImageGeneration, maxImages } = body

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
    let effectiveDuration = duration
    let effectiveResolution = resolution

    if (studioModel.pricing_type === 'per_second') {
      // Video model
      const paramSchema = studioModel.parameter_schema || {}
      const durationParam = paramSchema.duration
      const resolutionParam = paramSchema.resolution

      const durationOptions = durationParam?.options || studioModel.duration_options || [5]
      const resolutionOptions = resolutionParam?.options || studioModel.resolution_options || ['720p']

      effectiveDuration = duration ?? durationParam?.default ?? durationOptions[0]
      effectiveResolution = resolution ?? resolutionParam?.default ?? resolutionOptions[0]

      // Validate
      if (!durationOptions.includes(effectiveDuration)) {
        effectiveDuration = durationOptions[0]
      }
      if (!resolutionOptions.includes(effectiveResolution)) {
        effectiveResolution = resolutionOptions[0]
      }

      costCents = calculateVideoCost(studioModel, effectiveDuration as number, effectiveResolution as string, generateAudio)
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
