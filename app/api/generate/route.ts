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
  base64?: string      // Base64 encoded image data (for local uploads)
  mimeType?: string    // MIME type of the image
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
  // Seedream 4.5 sequential generation params
  sequentialImageGeneration?: 'disabled' | 'auto'
  maxImages?: number
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

// Upload base64 image to Supabase storage and return HTTP URL
// This converts local/blob images to URLs that Replicate can access
async function uploadBase64ToStorage(
  base64: string,
  mimeType: string,
  userId?: string
): Promise<string> {
  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(base64, 'base64')

    // Determine extension from mime type
    const ext = mimeType.includes('png') ? 'png'
      : mimeType.includes('gif') ? 'gif'
      : mimeType.includes('webp') ? 'webp'
      : 'jpg'

    // Generate unique filename
    const filename = `ref-${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`
    const path = userId ? `${userId}/references/${filename}` : `anonymous/references/${filename}`

    console.log('[Generate] Uploading base64 image to storage:', path, 'size:', buffer.length)

    // Upload to Supabase storage
    const { data, error } = await sbAdmin.storage
      .from('generated-images')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (error) {
      console.error('[Generate] Storage upload error:', error)
      throw error
    }

    // Get public URL
    const { data: urlData } = sbAdmin.storage
      .from('generated-images')
      .getPublicUrl(path)

    console.log('[Generate] Uploaded base64 to:', urlData.publicUrl)
    return urlData.publicUrl
  } catch (error) {
    console.error('[Generate] Error uploading base64 to storage:', error)
    throw error
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
    const { model, prompt, params = {}, referenceImages, images, conversationId, messageId, duration, resolution, generateAudio, sequentialImageGeneration, maxImages } = body

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

    // Handle Seedream 4.5 sequential generation parameters
    if (model === 'seedream-4.5') {
      // Set sequential generation mode if provided
      if (sequentialImageGeneration) {
        input.sequential_image_generation = sequentialImageGeneration
      }
      // Set max_images if sequential is enabled
      if (sequentialImageGeneration === 'auto' && maxImages) {
        input.max_images = Math.min(maxImages, 15)
      }
    }

    // Handle images with purpose-aware parameter mapping
    // Supports both new format (images with purpose) and legacy format (referenceImages)
    const rawImages: ImageWithPurpose[] = images?.length
      ? images
      : referenceImages?.map(url => ({ url, purpose: 'reference' as ImagePurpose })) || []

    // Process images: convert blob/base64 to HTTP URLs that Replicate can access
    const processedImages: { url: string; purpose: ImagePurpose }[] = []

    console.log('[Generate] Raw images received:', rawImages.length)
    for (const img of rawImages) {
      console.log('[Generate] Processing image:', {
        hasUrl: !!img.url,
        urlStart: img.url?.slice(0, 60),
        hasBase64: !!img.base64,
        purpose: img.purpose
      })

      let httpUrl = img.url

      // Check if URL is already a valid HTTP URL
      const isHttpUrl = img.url && (img.url.startsWith('http://') || img.url.startsWith('https://'))
      console.log('[Generate] isHttpUrl:', isHttpUrl)

      if (isHttpUrl) {
        // HTTP URLs can be used directly by Replicate (e.g., Skinny Hub images)
        console.log('[Generate] Using HTTP URL directly:', httpUrl?.slice(0, 80))
        processedImages.push({ url: httpUrl, purpose: img.purpose })
      } else if (img.base64) {
        // Local upload with base64 data - upload to Supabase to get HTTP URL
        console.log('[Generate] Converting base64 to HTTP URL for image with purpose:', img.purpose)
        try {
          httpUrl = await uploadBase64ToStorage(img.base64, img.mimeType || 'image/jpeg', whopUserId || undefined)
          processedImages.push({ url: httpUrl, purpose: img.purpose })
        } catch (uploadError) {
          console.error('[Generate] Failed to upload base64 image:', uploadError)
        }
      } else {
        // Blob URL without base64 - can't use it
        console.error('[Generate] Skipping blob URL without base64 data:', img.url?.slice(0, 50))
      }
    }

    console.log('[Generate] Processed images count:', processedImages.length)

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

    // Start the prediction and get the prediction ID immediately
    // This ensures we can track the generation even if the function times out
    const replicateModel = studioModel.replicate_model as `${string}/${string}` | `${string}/${string}:${string}`

    // Parse model identifier for predictions.create
    let modelOwner: string, modelName: string, modelVersion: string | undefined
    if (replicateModel.includes(':')) {
      const [ownerName, version] = replicateModel.split(':')
      const [owner, name] = ownerName.split('/')
      modelOwner = owner
      modelName = name
      modelVersion = version
    } else {
      const [owner, name] = replicateModel.split('/')
      modelOwner = owner
      modelName = name
    }

    // Create prediction (non-blocking start)
    console.log('[Generate] Creating prediction for:', modelOwner, modelName, modelVersion ? `version: ${modelVersion}` : 'latest')

    let prediction
    if (modelVersion) {
      prediction = await replicate.predictions.create({
        version: modelVersion,
        input,
      })
    } else {
      // For models without version, use the model identifier format
      prediction = await replicate.predictions.create({
        model: `${modelOwner}/${modelName}`,
        input,
      })
    }

    console.log('[Generate] Prediction created:', prediction.id, 'Status:', prediction.status)

    // Update generation record with prediction ID immediately
    // This allows the scheduled poll function to recover if we timeout
    if (generationId && prediction.id) {
      await sbAdmin
        .from("generations")
        .update({ replicate_prediction_id: prediction.id })
        .eq("id", generationId)
      console.log('[Generate] Saved prediction ID to generation:', generationId)
    }

    // Wait for prediction to complete with timeout
    // Use a shorter timeout than Netlify's limit to ensure we can save state
    const POLL_TIMEOUT_MS = 55000 // 55 seconds (leave 5s buffer before Netlify timeout)
    const POLL_INTERVAL_MS = 1000 // Poll every 1 second
    const startTime = Date.now()

    let completedPrediction = prediction
    while (completedPrediction.status === 'starting' || completedPrediction.status === 'processing') {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        console.log('[Generate] Prediction still processing after timeout, returning pending status')
        // Return a "pending" response - the frontend will need to poll or the scheduled function will complete it
        return NextResponse.json({
          success: false,
          pending: true,
          generationId,
          predictionId: prediction.id,
          message: 'Generation is processing. Please check your library in a few moments.',
        })
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      completedPrediction = await replicate.predictions.get(prediction.id)
      console.log('[Generate] Prediction status:', completedPrediction.status)
    }

    // Check for failure
    if (completedPrediction.status === 'failed' || completedPrediction.status === 'canceled') {
      console.error('[Generate] Prediction failed:', completedPrediction.error)

      if (generationId) {
        await sbAdmin
          .from("generations")
          .update({
            replicate_status: completedPrediction.status,
            replicate_error: completedPrediction.error || 'Unknown error',
            completed_at: new Date().toISOString(),
          })
          .eq("id", generationId)
      }

      return NextResponse.json({
        error: completedPrediction.error || 'Generation failed',
        code: 'PREDICTION_FAILED',
      }, { status: 500 })
    }

    // Prediction succeeded - extract output
    const output = completedPrediction.output

    // Handle different output formats from Replicate
    // Replicate SDK can return:
    // - Array of strings (URLs)
    // - Array of FileOutput objects (with .url(), .href, or toString())
    // - Single string URL
    // - Single FileOutput object
    // - Object with output property
    let outputUrls: string[] = []

    console.log('Replicate output type:', typeof output, Array.isArray(output) ? 'array' : '')
    console.log('Replicate output:', JSON.stringify(output, null, 2).slice(0, 500))

    // Helper to extract URL from various formats
    const extractUrl = (item: any): string | null => {
      if (!item) return null

      // Direct string
      if (typeof item === 'string') return item

      // FileOutput with url() method
      if (typeof item.url === 'function') {
        try { return item.url() } catch { }
      }

      // FileOutput with href property
      if (typeof item.href === 'string') return item.href

      // Object with url property
      if (typeof item.url === 'string') return item.url

      // toString() method (FileOutput objects support this)
      if (typeof item.toString === 'function' && item.toString !== Object.prototype.toString) {
        const str = item.toString()
        if (str.startsWith('http')) return str
      }

      return null
    }

    if (Array.isArray(output)) {
      for (const item of output) {
        const url = extractUrl(item)
        if (url) outputUrls.push(url)
      }
    } else {
      const url = extractUrl(output)
      if (url) outputUrls.push(url)
    }

    // If still no URLs, check if output has nested structure
    if (outputUrls.length === 0 && output && typeof output === 'object') {
      // Some models return { output: [...] } or similar
      const outputObj = output as Record<string, any>
      for (const key of ['output', 'images', 'video', 'result']) {
        if (outputObj[key]) {
          const nested = Array.isArray(outputObj[key]) ? outputObj[key] : [outputObj[key]]
          for (const item of nested) {
            const url = extractUrl(item)
            if (url) outputUrls.push(url)
          }
          if (outputUrls.length > 0) break
        }
      }
    }

    console.log('Extracted URLs:', outputUrls)

    if (outputUrls.length === 0) {
      console.error('Failed to extract URLs from output:', output)
      throw new Error('No output from model - could not extract URLs')
    }

    // === CALCULATE FINAL COST (dynamic billing for multi-image output) ===
    // For Seedream 4.5 with sequential generation, charge per image generated
    const numImagesGenerated = outputUrls.length
    let finalCostCents = costCents

    if (model === 'seedream-4.5' && numImagesGenerated > 1) {
      // Multiply base cost by number of images generated
      finalCostCents = costCents * numImagesGenerated
      console.log(`[Generate] Seedream 4.5 sequential: ${numImagesGenerated} images × ${costCents}¢ = ${finalCostCents}¢`)
    }

    // === FIRST UPDATE: Save temp URLs immediately after Replicate completes ===
    // This ensures the generation is saved even if storage upload fails/times out
    if (generationId) {
      console.log('[Generate] Saving temp URLs to DB immediately...')
      const { error: tempUpdateError } = await sbAdmin
        .from("generations")
        .update({
          output_urls: outputUrls,  // Temp Replicate URLs first
          replicate_status: 'succeeded',
          completed_at: new Date().toISOString(),
          cost_cents: finalCostCents,
          metadata: {
            images_generated: numImagesGenerated,
            storage_pending: true,  // Flag that we still need to upload to storage
            ...(model === 'seedream-4.5' && sequentialImageGeneration === 'auto' && {
              sequential_mode: true,
              max_images_requested: maxImages,
            }),
          },
        })
        .eq("id", generationId)

      if (tempUpdateError) {
        console.error('[Generate] Failed to save temp URLs:', tempUpdateError)
      } else {
        console.log('[Generate] Temp URLs saved successfully')
      }
    }

    // === SAVE IMAGES TO SUPABASE STORAGE ===
    // Convert temporary Replicate URLs to permanent Supabase storage URLs
    // Upload ALL images in parallel for speed - Replicate URLs expire in ~1 hour
    // We MUST upload to permanent storage before URLs expire
    const STORAGE_UPLOAD_TIMEOUT = 15000 // 15 seconds per image (increased for reliability)

    console.log(`[Generate] Uploading ${outputUrls.length} images to permanent storage in parallel...`)

    const uploadPromises = outputUrls.map(async (tempUrl, index) => {
      try {
        const permanentUrl = await Promise.race([
          saveImageToStorage(tempUrl, whopUserId || undefined),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Storage upload timeout')), STORAGE_UPLOAD_TIMEOUT)
          )
        ])
        console.log(`[Generate] Image ${index + 1} uploaded successfully`)
        return { success: true, url: permanentUrl, tempUrl }
      } catch (error) {
        console.error(`[Generate] Image ${index + 1} upload failed:`, error)
        return { success: false, url: tempUrl, tempUrl, error }
      }
    })

    const uploadResults = await Promise.all(uploadPromises)
    const permanentUrls = uploadResults.map(r => r.url)
    const failedUploads = uploadResults.filter(r => !r.success)

    if (failedUploads.length > 0) {
      console.warn(`[Generate] ${failedUploads.length}/${outputUrls.length} uploads failed - will need migration`)
    }

    // Use the permanent URLs (or fallback temp URLs)
    const finalOutputUrls = permanentUrls
    const imageUrl = finalOutputUrls[0]

    // === SECOND UPDATE: Update with permanent storage URLs ===
    if (generationId) {
      console.log('[Generate] Updating with permanent storage URLs...')
      const allUploadsSucceeded = failedUploads.length === 0
      const { error: updateError } = await sbAdmin
        .from("generations")
        .update({
          output_urls: finalOutputUrls,
          metadata: {
            images_generated: numImagesGenerated,
            storage_pending: !allUploadsSucceeded,  // True if any uploads failed (needs migration)
            storage_complete: allUploadsSucceeded,
            failed_uploads: failedUploads.length,
            ...(model === 'seedream-4.5' && sequentialImageGeneration === 'auto' && {
              sequential_mode: true,
              max_images_requested: maxImages,
            }),
          },
        })
        .eq("id", generationId)

      if (updateError) {
        console.error('[Generate] Failed to update with permanent URLs:', updateError)
      } else {
        console.log(`[Generate] URLs saved successfully (${allUploadsSucceeded ? 'all permanent' : 'some temp URLs need migration'})`)
      }
    }

    // === DEDUCT BALANCE (only if not lifetime and cost > 0) ===
    if (userProfileId && !hasLifetimeAccess && finalCostCents > 0) {
      const { error: deductError } = await sbAdmin
        .from("user_profiles")
        .update({
          balance_cents: balanceCents - finalCostCents,
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
      const effectiveCost = hasLifetimeAccess ? 0 : finalCostCents

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
          images_generated: numImagesGenerated,
          // Seedream 4.5 sequential pricing breakdown
          ...(model === 'seedream-4.5' && numImagesGenerated > 1 && {
            sequential_mode: true,
            cost_per_image_cents: costCents,
            total_cost_cents: finalCostCents,
          }),
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
      cost: finalCostCents,
      generationId,
      newBalance: hasLifetimeAccess ? balanceCents : balanceCents - finalCostCents,
      imagesGenerated: numImagesGenerated,
      // Seedream 4.5 sequential pricing breakdown
      ...(model === 'seedream-4.5' && numImagesGenerated > 1 && {
        pricingBreakdown: {
          sequentialMode: true,
          costPerImageCents: costCents,
          imagesGenerated: numImagesGenerated,
          totalCostCents: finalCostCents,
        }
      }),
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
