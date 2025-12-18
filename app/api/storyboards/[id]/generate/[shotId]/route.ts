import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'
import { MODEL_SPECS } from '@/lib/orchestrator/model-specs'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for generation

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
    } = body

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

    // Collect reference images from entities
    const referenceImages: string[] = []
    const maxRefs = getModelMaxReferences(modelSlug)
    const supportsRefs = modelSupportsReferences(modelSlug)

    if (supportsRefs && maxRefs > 0) {
      for (const entity of entities) {
        if (entity.primary_image_url && referenceImages.length < maxRefs) {
          referenceImages.push(entity.primary_image_url)
        }
      }
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
        images: referenceImages.length > 0
          ? referenceImages.map(url => ({ url, purpose: 'reference' }))
          : undefined,
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
