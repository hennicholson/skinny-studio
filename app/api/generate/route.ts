import Replicate from 'replicate'
import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for generation

// Image purpose types - must match frontend
type ImagePurpose = 'reference' | 'starting_frame' | 'edit_target' | 'last_frame'

interface ImageWithPurpose {
  url: string
  purpose: ImagePurpose
}

interface GenerateRequest {
  model: string
  prompt: string
  params?: Record<string, any>
  referenceImages?: string[] // Legacy support - treated as 'reference' purpose
  images?: ImageWithPurpose[] // New format with purpose metadata
  conversationId?: string
  messageId?: string
  // Video-specific params
  duration?: number
  resolution?: string
  generateAudio?: boolean // For Veo models - controls audio generation and pricing
}

// Calculate cost for video models (per-second pricing)
// Handles: resolution multipliers (Wan 2.5), audio toggle pricing (Veo 3.1)
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
    // Veo models have different pricing based on audio toggle
    // Default to audio ON if not explicitly set to false
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

// Initialize Replicate with API key
function getReplicateClient() {
  const apiKey = process.env.REPLICATE_API_TOKEN
  if (!apiKey) {
    throw new Error('REPLICATE_API_TOKEN not configured')
  }
  return new Replicate({ auth: apiKey })
}

// Download image from URL and upload to Supabase storage
async function saveImageToStorage(imageUrl: string, userId?: string): Promise<string> {
  try {
    // Fetch the image from Replicate's temp URL
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Determine content type from response or default to webp
    const contentType = response.headers.get('content-type') || 'image/webp'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp'

    // Generate unique filename with optional user folder
    const filename = `${uuidv4()}.${ext}`
    const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

    // Upload to Supabase storage
    const { data, error } = await sbAdmin.storage
      .from('generated-images')
      .upload(path, buffer, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      // Return original URL if upload fails
      return imageUrl
    }

    // Get public URL
    const { data: urlData } = sbAdmin.storage
      .from('generated-images')
      .getPublicUrl(path)

    return urlData.publicUrl
  } catch (error) {
    console.error('Error saving image to storage:', error)
    // Return original URL if anything fails
    return imageUrl
  }
}

export async function POST(request: Request) {
  try {
    // === AUTH CHECK ===
    let whopUserId: string | null = null
    let userProfileId: string | null = null
    let balanceCents = 0
    let hasLifetimeAccess = false

    const isAuthenticated = await hasWhopAuth()

    if (isAuthenticated) {
      try {
        const { token, hintedId } = await getWhopAuthFromHeaders()
        const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
        whopUserId = whop.id // This is a UUID generated from the whop user id

        // Get or create user profile - keyed by whop_user_id (the UUID)
        let { data: profile, error: profileError } = await sbAdmin
          .from("user_profiles")
          .select("*")
          .eq("whop_user_id", whopUserId)
          .maybeSingle()

        if (profileError) {
          console.error("Error fetching profile:", profileError)
        }

        // Create profile if doesn't exist
        if (!profile) {
          const { data: newProfile, error: createError } = await sbAdmin
            .from("user_profiles")
            .insert({
              whop_user_id: whopUserId,
              whop_unique_id: whop.unique_id,
              email: whop.email,
              username: whop.username,
              balance_cents: 0,
              lifetime_access: false,
            })
            .select()
            .single()

          if (createError) {
            console.error("Error creating profile:", createError)
          } else {
            profile = newProfile
          }
        }

        if (profile) {
          userProfileId = profile.id
          balanceCents = profile.balance_cents || 0
          hasLifetimeAccess = profile.lifetime_access || false
        }
      } catch (authError) {
        console.log("Auth check failed:", authError)
      }
    }

    const body = await request.json() as GenerateRequest
    const { model, prompt, params = {}, referenceImages, images, conversationId, messageId, duration, resolution, generateAudio } = body

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
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

    // Calculate cost based on pricing type
    let costCents = 0
    let effectiveDuration = duration
    let effectiveResolution = resolution
    let effectiveGenerateAudio = generateAudio

    if (studioModel.pricing_type === 'per_second') {
      // Video model - calculate based on duration, resolution, and audio
      const paramSchema = studioModel.parameter_schema || {}
      const durationParam = paramSchema.duration
      const resolutionParam = paramSchema.resolution
      const audioParam = paramSchema.generate_audio

      // Get options from parameter_schema or fall back to legacy fields
      const durationOptions = durationParam?.options || studioModel.duration_options || [5]
      const resolutionOptions = resolutionParam?.options || studioModel.resolution_options || ['720p']

      // Use provided values or defaults from parameter_schema
      effectiveDuration = duration ?? durationParam?.default ?? durationOptions[0]
      effectiveResolution = resolution ?? resolutionParam?.default ?? resolutionOptions[0]

      // Default audio to true for Veo models (as per their parameter_schema)
      effectiveGenerateAudio = generateAudio ?? audioParam?.default ?? true

      // Validate duration is in allowed options
      if (!durationOptions.includes(effectiveDuration)) {
        effectiveDuration = durationOptions[0]
      }

      // Validate resolution is in allowed options
      if (!resolutionOptions.includes(effectiveResolution)) {
        effectiveResolution = resolutionOptions[0]
      }

      costCents = calculateVideoCost(studioModel, effectiveDuration as number, effectiveResolution as string, effectiveGenerateAudio)
    } else {
      // Image model - flat rate
      costCents = studioModel.cost_per_run_cents || 0
    }

    // === BALANCE CHECK (skip for lifetime users or free models) ===
    if (whopUserId && !hasLifetimeAccess && costCents > 0 && balanceCents < costCents) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          required: costCents,
          available: balanceCents,
          code: 'INSUFFICIENT_BALANCE'
        },
        { status: 402 }
      )
    }

    const replicate = getReplicateClient()

    // Build input from model's default parameters merged with user params
    const input: Record<string, any> = {
      prompt,
      ...studioModel.default_parameters,
      ...params,
    }

    // Handle video-specific parameters
    if (studioModel.pricing_type === 'per_second') {
      // Set duration and resolution for video models
      if (effectiveDuration) input.duration = effectiveDuration
      if (effectiveResolution) input.resolution = effectiveResolution

      // Set generate_audio for Veo models
      if (model.startsWith('veo-')) {
        input.generate_audio = effectiveGenerateAudio
      }
    }

    // Handle images with purpose-aware parameter mapping
    // Supports both new format (images with purpose) and legacy format (referenceImages)
    const processedImages = images?.length
      ? images
      : referenceImages?.map(url => ({ url, purpose: 'reference' as ImagePurpose })) || []

    if (processedImages.length > 0) {
      // Group images by purpose
      const byPurpose: Record<ImagePurpose, string[]> = {
        reference: [],
        starting_frame: [],
        edit_target: [],
        last_frame: [],
      }

      for (const img of processedImages) {
        byPurpose[img.purpose].push(img.url)
      }

      // ===== REFERENCE IMAGES (ingredients, style guides) =====
      // Based on actual Replicate API documentation for each model
      if (byPurpose.reference.length > 0) {
        // FLUX 2 Pro/Dev: input_images (array, max 8)
        if (model === 'flux-2-pro' || model === 'flux-2-dev') {
          input.input_images = byPurpose.reference
        }
        // Seedream 4.5: image_input (array, 1-14 images)
        else if (model === 'seedream-4.5') {
          input.image_input = byPurpose.reference
        }
        // Nano Banana / Nano Banana Pro: image_input (array)
        else if (model === 'nano-banana' || model === 'nano-banana-pro' || model === 'nano-banana-pro-4k') {
          input.image_input = byPurpose.reference
        }
        // Veo 3.1: reference_images (array, 1-3 images) - for R2V mode
        else if (model === 'veo-3.1' || model === 'veo-3.1-fast') {
          input.reference_images = byPurpose.reference
        }
        // P-Image-Edit: images (array) - can also be used as reference
        else if (model === 'p-image-edit') {
          input.images = byPurpose.reference
        }
        // Qwen Image Edit Plus: image (array) - can also be used as reference
        else if (model === 'qwen-image-edit-plus') {
          input.image = byPurpose.reference
        }
        // Generic fallback
        else {
          input.reference_images = byPurpose.reference
        }
      }

      // ===== STARTING FRAME (first frame for video generation) =====
      if (byPurpose.starting_frame.length > 0) {
        const startFrame = byPurpose.starting_frame[0]

        // Wan 2.5 I2V: image (required, single URI)
        if (model === 'wan-2.5-i2v') {
          input.image = startFrame
        }
        // Kling V2.5: start_image (single URI) - note: "image" is deprecated
        else if (model === 'kling-v2.5-turbo-pro') {
          input.start_image = startFrame
        }
        // Hailuo 2.3 (MiniMax): first_frame_image (single URI)
        else if (model === 'hailuo-2.3') {
          input.first_frame_image = startFrame
        }
        // Veo 3.1: image (single URI) - for I2V mode
        else if (model === 'veo-3.1' || model === 'veo-3.1-fast') {
          input.image = startFrame
        }
        // Generic fallback for other video models
        else {
          input.image = startFrame
        }
      }

      // ===== EDIT TARGET (image to modify/edit) =====
      if (byPurpose.edit_target.length > 0) {
        // P-Image-Edit: images (array of URIs)
        // "For editing task, provide the main image as the first image"
        if (model === 'p-image-edit') {
          input.images = byPurpose.edit_target
        }
        // Qwen Image Edit Plus: image (array of URIs)
        else if (model === 'qwen-image-edit-plus') {
          input.image = byPurpose.edit_target
        }
        // Generic edit fallback
        else {
          input.images = byPurpose.edit_target
        }
      }

      // ===== LAST FRAME (end frame for video interpolation) =====
      if (byPurpose.last_frame.length > 0) {
        // Veo 3.1: last_frame (single URI) - creates transition between start and end
        if (model === 'veo-3.1' || model === 'veo-3.1-fast') {
          input.last_frame = byPurpose.last_frame[0]
        }
        // Generic fallback for other models that might support end frames
        else {
          input.end_image = byPurpose.last_frame[0]
        }
      }
    }

    // Create generation record BEFORE running (status: pending)
    let generationId: string | null = null
    if (whopUserId) {
      const { data: genRecord, error: genError } = await sbAdmin
        .from("generations")
        .insert({
          whop_user_id: whopUserId,
          user_id: userProfileId,
          model_id: studioModel.id,
          model_slug: model,
          model_category: studioModel.category,
          conversation_id: conversationId || null,
          message_id: messageId || null,
          prompt,
          parameters: params,
          cost_cents: costCents,
          replicate_status: 'starting',
        })
        .select("id")
        .single()

      if (!genError && genRecord) {
        generationId = genRecord.id
      }
    }

    // Run the model
    const output = await replicate.run(
      studioModel.replicate_model as `${string}/${string}` | `${string}/${string}:${string}`,
      { input }
    )

    // Handle different output formats
    let outputUrls: string[] = []

    if (Array.isArray(output)) {
      for (const item of output) {
        if (typeof item === 'string') {
          outputUrls.push(item)
        } else if (item && typeof item === 'object') {
          if ('url' in item && typeof item.url === 'function') {
            outputUrls.push(item.url())
          } else if ('url' in item) {
            outputUrls.push(item.url as string)
          }
        }
      }
    } else if (typeof output === 'string') {
      outputUrls.push(output)
    } else if (output && typeof output === 'object') {
      if ('url' in output && typeof (output as any).url === 'function') {
        outputUrls.push((output as any).url())
      } else if ('url' in output) {
        outputUrls.push((output as any).url)
      }
    }

    if (outputUrls.length === 0) {
      throw new Error('No output from model')
    }

    // === SAVE IMAGES TO SUPABASE STORAGE ===
    // Convert temporary Replicate URLs to permanent Supabase storage URLs
    const permanentUrls: string[] = []
    for (const tempUrl of outputUrls) {
      const permanentUrl = await saveImageToStorage(tempUrl, whopUserId || undefined)
      permanentUrls.push(permanentUrl)
    }

    // Use the permanent URLs instead of temp Replicate URLs
    const finalOutputUrls = permanentUrls
    const imageUrl = finalOutputUrls[0]

    // === UPDATE GENERATION RECORD ===
    if (generationId) {
      await sbAdmin
        .from("generations")
        .update({
          output_urls: finalOutputUrls,
          replicate_status: 'succeeded',
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId)
    }

    // === DEDUCT BALANCE (only if not lifetime and cost > 0) ===
    if (userProfileId && !hasLifetimeAccess && costCents > 0) {
      const { error: deductError } = await sbAdmin
        .from("user_profiles")
        .update({
          balance_cents: balanceCents - costCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userProfileId)

      if (deductError) {
        console.error("Failed to deduct balance:", deductError)
      }
    }

    // === LOG TRANSACTION FOR ALL USERS (including lifetime) ===
    // This ensures all users see their generation history in spending log
    if (whopUserId) {
      const effectiveCost = hasLifetimeAccess ? 0 : costCents

      const { error: txError } = await sbAdmin.from("credit_transactions").insert({
        user_id: whopUserId,
        type: "usage",
        amount: -effectiveCost,
        amount_charged: effectiveCost,
        app_name: "Skinny Studio",
        task: studioModel.category === 'video' ? 'video_generation' : 'image_generation',
        status: "completed",
        preview: imageUrl,
        metadata: {
          model,
          model_name: studioModel.name,
          prompt,
          params,
          category: studioModel.category,
          pricing_type: studioModel.pricing_type,
          is_lifetime_user: hasLifetimeAccess,
          // Video-specific pricing breakdown
          ...(studioModel.pricing_type === 'per_second' && {
            duration: effectiveDuration,
            resolution: effectiveResolution,
            cost_per_second_cents: studioModel.cost_per_second_cents,
            resolution_multiplier: studioModel.resolution_multipliers?.[effectiveResolution as string] || 1.0,
            // Veo audio pricing info
            ...(model.startsWith('veo-') && {
              generate_audio: effectiveGenerateAudio,
              audio_pricing: studioModel.parameter_schema?.generate_audio?.pricing,
            }),
          }),
        },
      })

      if (txError) {
        console.error("Failed to log credit transaction:", txError)
      }
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      outputUrls: finalOutputUrls,
      model: studioModel.name,
      modelSlug: model,
      category: studioModel.category,
      prompt,
      cost: costCents,
      generationId,
      newBalance: hasLifetimeAccess ? balanceCents : balanceCents - costCents,
      // Video-specific pricing breakdown
      ...(studioModel.pricing_type === 'per_second' && {
        pricingBreakdown: {
          duration: effectiveDuration,
          resolution: effectiveResolution,
          costPerSecond: studioModel.cost_per_second_cents,
          resolutionMultiplier: studioModel.resolution_multipliers?.[effectiveResolution as string] || 1.0,
          // Veo audio info
          ...(model.startsWith('veo-') && {
            generateAudio: effectiveGenerateAudio,
          }),
        }
      }),
    })

  } catch (error) {
    console.error('Generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Generation failed'
    return NextResponse.json({
      error: errorMessage,
      code: 'GENERATION_FAILED',
    }, { status: 500 })
  }
}
