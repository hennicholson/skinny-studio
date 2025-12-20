import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'
import { MODEL_SPECS } from '@/lib/orchestrator/model-specs'
import Replicate from 'replicate'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for generation

// Initialize Replicate client for fallback polling
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Determine if a URL or content type is video
function isVideoContent(url: string, contentType?: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
  const videoMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime']
  const urlLower = url.toLowerCase()
  if (videoExtensions.some(ext => urlLower.includes(ext))) return true
  if (contentType && videoMimeTypes.some(mime => contentType.includes(mime))) return true
  return false
}

// Get file extension from content type
function getExtensionFromContentType(contentType: string, isVideo: boolean): string {
  if (isVideo) {
    if (contentType.includes('mp4')) return 'mp4'
    if (contentType.includes('webm')) return 'webm'
    return 'mp4'
  }
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  return 'webp'
}

// Download media and upload to Supabase storage
async function saveMediaToStorage(mediaUrl: string, userId?: string): Promise<string> {
  try {
    const response = await fetch(mediaUrl)
    if (!response.ok) return mediaUrl

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = response.headers.get('content-type') || 'image/webp'
    const isVideo = isVideoContent(mediaUrl, contentType)
    const ext = getExtensionFromContentType(contentType, isVideo)
    const bucket = isVideo ? 'generated-videos' : 'generated-images'

    const filename = `${uuidv4()}.${ext}`
    const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

    const { error } = await sbAdmin.storage
      .from(bucket)
      .upload(path, buffer, { contentType, upsert: false })

    if (error) return mediaUrl

    const { data: urlData } = sbAdmin.storage.from(bucket).getPublicUrl(path)
    return urlData.publicUrl
  } catch {
    return mediaUrl
  }
}

// Extract URLs from Replicate output
function extractOutputUrls(output: any): string[] {
  if (!output) return []
  if (Array.isArray(output)) {
    return output.map(item => {
      if (typeof item === 'string') return item
      if (item && typeof item.url === 'function') return item.url()
      if (item && item.href) return item.href
      return String(item)
    }).filter(url => url && url.startsWith('http'))
  }
  if (typeof output === 'string' && output.startsWith('http')) return [output]
  if (output && output.url) return [typeof output.url === 'function' ? output.url() : output.url]
  return []
}

// Helper to verify storyboard ownership
async function verifyOwnership(storyboardId: string, whopUserId: string) {
  const { data } = await sbAdmin
    .from('storyboards')
    .select('id')
    .eq('id', storyboardId)
    .eq('whop_user_id', whopUserId)
    .single()
  return !!data
}

// Get model's max reference images
function getModelMaxReferences(modelSlug: string): number {
  const spec = MODEL_SPECS.find(m => m.id === modelSlug)
  return spec?.maxReferenceImages || 0
}

// Check if model supports reference images
function modelSupportsReferences(modelSlug: string): boolean {
  const spec = MODEL_SPECS.find(m => m.id === modelSlug)
  return spec?.capabilities?.supportsReferenceImages || false
}

// POST /api/storyboards/[id]/generate/[shotId]
// Generate a shot with entity references
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  try {
    const { id, shotId } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!(await verifyOwnership(id, whop.id))) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      modelSlug = 'seedream-4.5',
      customPrompt,
      params: customParams = {},
      referenceImages: userReferenceImages = [], // User-selected shot references
    } = body

    console.log('[Storyboard Generate] userReferenceImages received:', userReferenceImages)

    // Get shot details
    const { data: shot, error: shotError } = await sbAdmin
      .from('storyboard_shots')
      .select('*')
      .eq('id', shotId)
      .eq('storyboard_id', id)
      .single()

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
    }

    // Get storyboard for context
    const { data: storyboard } = await sbAdmin
      .from('storyboards')
      .select('*')
      .eq('id', id)
      .single()

    // Get entities assigned to this shot
    const { data: entityRefs } = await sbAdmin
      .from('shot_entity_references')
      .select(`
        *,
        storyboard_entities (
          id,
          entity_type,
          entity_name,
          entity_description,
          primary_image_url,
          vision_context
        )
      `)
      .eq('shot_id', shotId)

    // Build the prompt
    let prompt = customPrompt || shot.prompt || shot.ai_suggested_prompt || shot.description

    // Enhance prompt with entity vision contexts if available
    const entities = entityRefs?.map(ref => ref.storyboard_entities).filter(Boolean) || []
    const entityContexts = entities
      .filter(e => e.vision_context)
      .map(e => `[${e.entity_name}]: ${e.vision_context}`)

    if (entityContexts.length > 0 && !customPrompt) {
      // Prepend entity context to help the model understand referenced elements
      prompt = `${prompt}\n\n[Entity Visual References:\n${entityContexts.join('\n')}\n]`
    }

    // Add storyboard style notes if available
    if (storyboard?.style_notes && !customPrompt) {
      prompt = `${prompt}\n\n[Style: ${storyboard.style_notes}]`
    }

    // Collect reference images: user-selected shots first, then entity images
    const referenceImages: string[] = []
    const maxRefs = getModelMaxReferences(modelSlug)
    const supportsRefs = modelSupportsReferences(modelSlug)

    if (supportsRefs && maxRefs > 0) {
      // Add user-selected shot references first (higher priority)
      for (const refUrl of userReferenceImages) {
        if (refUrl && referenceImages.length < maxRefs) {
          referenceImages.push(refUrl)
        }
      }

      // Then add entity images
      for (const entity of entities) {
        if (entity.primary_image_url && referenceImages.length < maxRefs) {
          referenceImages.push(entity.primary_image_url)
        }
      }
    }

    console.log('[Storyboard Generate] Final referenceImages array:', referenceImages)
    console.log('[Storyboard Generate] supportsRefs:', supportsRefs, 'maxRefs:', maxRefs)

    // ===== PRE-FLIGHT BALANCE CHECK =====
    // Check balance BEFORE starting generation to fail fast
    // Use user_profiles table (same as main chat system)
    const { data: userProfile, error: profileError } = await sbAdmin
      .from('user_profiles')
      .select('balance_cents, lifetime_access')
      .eq('whop_user_id', whop.id)
      .single()

    if (profileError) {
      console.error('Failed to fetch user profile:', profileError)
      return NextResponse.json({ error: 'Failed to verify balance' }, { status: 500 })
    }

    // Get model cost from database (use cost_per_run_cents, not cost_cents)
    const { data: modelData, error: modelError } = await sbAdmin
      .from('studio_models')
      .select('cost_per_run_cents, cost_per_second_cents, pricing_type, name')
      .eq('slug', modelSlug)
      .single()

    if (modelError) {
      console.error('Failed to fetch model:', modelError)
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 })
    }

    // Calculate estimated cost (same logic as main chat)
    const modelSpec = MODEL_SPECS.find(m => m.id === modelSlug)
    const isVideoModel = modelSpec?.type === 'video' || modelData?.pricing_type === 'per_second'
    const duration = shot.duration_seconds || 5

    let estimatedCost = 0
    if (isVideoModel && modelData?.cost_per_second_cents) {
      estimatedCost = modelData.cost_per_second_cents * duration
    } else if (modelData?.cost_per_run_cents) {
      estimatedCost = modelData.cost_per_run_cents
    } else {
      // Fallback cost estimate
      estimatedCost = isVideoModel ? 50 : 10
    }

    // Check if user has lifetime access (skip balance check) or sufficient balance
    const hasLifetimeAccess = userProfile?.lifetime_access === true
    const currentBalance = userProfile?.balance_cents || 0

    if (!hasLifetimeAccess && currentBalance < estimatedCost) {
      return NextResponse.json({
        error: 'Insufficient balance',
        code: 'INSUFFICIENT_BALANCE',
        required: estimatedCost,
        available: currentBalance,
        modelName: modelData?.name || modelSlug,
      }, { status: 402 })
    }

    // Update shot status to generating
    await sbAdmin
      .from('storyboard_shots')
      .update({
        status: 'generating',
        model_slug: modelSlug,
        prompt,
      })
      .eq('id', shotId)

    // Forward auth headers for generation
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const whopToken = request.headers.get('x-whop-user-token')
    const whopUserId = request.headers.get('x-whop-user-id')
    const cookie = request.headers.get('cookie')

    if (whopToken) forwardHeaders['x-whop-user-token'] = whopToken
    if (whopUserId) forwardHeaders['x-whop-user-id'] = whopUserId
    if (cookie) forwardHeaders['cookie'] = cookie

    // Call the generate API
    const generateUrl = new URL('/api/generate', request.url).href

    const imagesToSend = referenceImages.length > 0
      ? referenceImages.map(url => ({ url, purpose: 'reference' }))
      : undefined
    console.log('[Storyboard Generate] images to send to /api/generate:', imagesToSend)

    const genResponse = await fetch(generateUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        model: modelSlug,
        prompt,
        params: {
          aspect_ratio: storyboard?.default_aspect_ratio || '16:9',
          ...customParams,
        },
        // Pass entity images as references
        images: imagesToSend,
        // For video generation
        duration: shot.duration_seconds,
        // Return immediately for frontend polling
        noWait: true,
      }),
    })

    const genResult = await genResponse.json()

    if (genResult.error) {
      // Update shot status to error
      await sbAdmin
        .from('storyboard_shots')
        .update({ status: 'error' })
        .eq('id', shotId)

      return NextResponse.json({
        error: genResult.error,
        code: genResult.code,
        required: genResult.required,
        available: genResult.available,
      }, { status: genResponse.status })
    }

    // If pending, store generation ID for polling
    if (genResult.pending && genResult.generationId) {
      const { data: updatedShot } = await sbAdmin
        .from('storyboard_shots')
        .update({
          generation_id: genResult.generationId,
        })
        .eq('id', shotId)
        .select()
        .single()

      return NextResponse.json({
        success: false,
        pending: true,
        generationId: genResult.generationId,
        shotId,
        message: 'Generation started. Poll for completion.',
        shot: updatedShot,
      })
    }

    // If complete, update shot with result
    if (genResult.success && genResult.imageUrl) {
      const { data: updatedShot } = await sbAdmin
        .from('storyboard_shots')
        .update({
          status: 'completed',
          generation_id: genResult.generationId,
          generated_at: new Date().toISOString(),
        })
        .eq('id', shotId)
        .select()
        .single()

      // Update storyboard completed_shots count
      const { data: completedCount } = await sbAdmin
        .from('storyboard_shots')
        .select('id', { count: 'exact' })
        .eq('storyboard_id', id)
        .eq('status', 'completed')

      await sbAdmin
        .from('storyboards')
        .update({ completed_shots: completedCount?.length || 0 })
        .eq('id', id)

      return NextResponse.json({
        success: true,
        imageUrl: genResult.imageUrl,
        outputUrls: genResult.outputUrls,
        generationId: genResult.generationId,
        shotId,
        cost: genResult.cost,
        newBalance: genResult.newBalance,
        // Return the updated shot with generatedImageUrl
        shot: {
          ...updatedShot,
          generatedImageUrl: genResult.imageUrl,
        },
      })
    }

    return NextResponse.json({
      error: 'Unexpected generation result',
    }, { status: 500 })

  } catch (error) {
    console.error('Shot generation API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET /api/storyboards/[id]/generate/[shotId]
// Poll for generation status
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  try {
    const { id, shotId } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!(await verifyOwnership(id, whop.id))) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    // Get shot
    const { data: shot, error: shotError } = await sbAdmin
      .from('storyboard_shots')
      .select('*')
      .eq('id', shotId)
      .eq('storyboard_id', id)
      .single()

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
    }

    if (!shot.generation_id) {
      return NextResponse.json({
        status: shot.status,
        message: 'No generation in progress',
      })
    }

    // Check generation status
    const { data: generation } = await sbAdmin
      .from('generations')
      .select('*')
      .eq('id', shot.generation_id)
      .single()

    if (!generation) {
      return NextResponse.json({
        status: 'error',
        message: 'Generation not found',
      })
    }

    // Check if complete
    if (generation.replicate_status === 'succeeded' && generation.output_urls?.length > 0) {
      // Update shot if not already completed
      if (shot.status !== 'completed') {
        await sbAdmin
          .from('storyboard_shots')
          .update({
            status: 'completed',
            generated_at: new Date().toISOString(),
          })
          .eq('id', shotId)

        // Update storyboard completed_shots count
        const { data: completedCount } = await sbAdmin
          .from('storyboard_shots')
          .select('id', { count: 'exact' })
          .eq('storyboard_id', id)
          .eq('status', 'completed')

        await sbAdmin
          .from('storyboards')
          .update({ completed_shots: completedCount?.length || 0 })
          .eq('id', id)
      }

      return NextResponse.json({
        status: 'completed',
        imageUrl: generation.output_urls[0],
        outputUrls: generation.output_urls,
        generationId: generation.id,
      })
    }

    // Check if failed
    if (generation.replicate_status === 'failed' || generation.replicate_status === 'canceled') {
      await sbAdmin
        .from('storyboard_shots')
        .update({ status: 'error' })
        .eq('id', shotId)

      return NextResponse.json({
        status: 'error',
        error: generation.replicate_error || 'Generation failed',
      })
    }

    // FALLBACK: If still starting/processing, poll Replicate directly
    // This handles cases where the webhook hasn't fired (e.g., localhost development)
    if (
      (generation.replicate_status === 'starting' || generation.replicate_status === 'processing') &&
      generation.replicate_prediction_id
    ) {
      try {
        console.log('[Storyboard] Fallback check for prediction:', generation.replicate_prediction_id)
        const prediction = await replicate.predictions.get(generation.replicate_prediction_id)

        if (prediction.status === 'succeeded' && prediction.output) {
          console.log('[Storyboard] Prediction succeeded! Saving to storage...')

          // Extract and save output URLs to permanent storage
          const outputUrls = extractOutputUrls(prediction.output)
          if (outputUrls.length > 0) {
            const permanentUrls: string[] = []
            for (const tempUrl of outputUrls) {
              const permanentUrl = await saveMediaToStorage(tempUrl, generation.whop_user_id || undefined)
              permanentUrls.push(permanentUrl)
            }

            // Update generation in database
            await sbAdmin
              .from('generations')
              .update({
                output_urls: permanentUrls,
                replicate_status: 'succeeded',
                completed_at: new Date().toISOString(),
              })
              .eq('id', generation.id)

            // Update shot status
            await sbAdmin
              .from('storyboard_shots')
              .update({
                status: 'completed',
                generated_at: new Date().toISOString(),
              })
              .eq('id', shotId)

            // Update storyboard completed_shots count
            const { data: completedCount } = await sbAdmin
              .from('storyboard_shots')
              .select('id', { count: 'exact' })
              .eq('storyboard_id', id)
              .eq('status', 'completed')

            await sbAdmin
              .from('storyboards')
              .update({ completed_shots: completedCount?.length || 0 })
              .eq('id', id)

            console.log('[Storyboard] Shot generation complete via fallback polling')

            return NextResponse.json({
              status: 'completed',
              imageUrl: permanentUrls[0],
              outputUrls: permanentUrls,
              generationId: generation.id,
            })
          }
        } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
          console.log('[Storyboard] Prediction failed:', prediction.error)

          await sbAdmin
            .from('generations')
            .update({
              replicate_status: prediction.status,
              replicate_error: prediction.error || 'Unknown error',
              completed_at: new Date().toISOString(),
            })
            .eq('id', generation.id)

          await sbAdmin
            .from('storyboard_shots')
            .update({ status: 'error' })
            .eq('id', shotId)

          return NextResponse.json({
            status: 'error',
            error: prediction.error || 'Generation failed',
          })
        }
        // Still processing - continue to return generating status
      } catch (replicateError) {
        console.error('[Storyboard] Replicate fallback check failed:', replicateError)
        // Continue with returning current database state
      }
    }

    // Still processing
    return NextResponse.json({
      status: 'generating',
      generationId: generation.id,
      replicateStatus: generation.replicate_status,
    })

  } catch (error) {
    console.error('Shot generation poll API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
