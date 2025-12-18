import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'
import { getEffectiveGeminiApiKey } from '@/lib/platform-settings'

export const runtime = 'nodejs'
export const maxDuration = 60

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

// POST /api/storyboards/[id]/entities/[entityId]/analyze
// Analyze entity image with Gemini vision to get visual context
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; entityId: string }> }
) {
  try {
    const { id, entityId } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!(await verifyOwnership(id, whop.id))) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    // Get entity
    const { data: entity, error: entityError } = await sbAdmin
      .from('storyboard_entities')
      .select('*')
      .eq('id', entityId)
      .eq('storyboard_id', id)
      .single()

    if (entityError || !entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    if (!entity.primary_image_url) {
      return NextResponse.json({ error: 'Entity has no image to analyze' }, { status: 400 })
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

    // Download and convert image to base64
    const { base64, mimeType } = await imageUrlToBase64(entity.primary_image_url)

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(effectiveApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Build analysis prompt based on entity type
    const typePrompts: Record<string, string> = {
      character: `Analyze this character image. Describe in detail:
- Physical appearance (age, build, height impression, skin tone, hair color/style)
- Facial features (eye color, distinguishing marks, expression)
- Clothing and accessories (style, colors, notable items)
- Pose and body language
- Any unique identifying features (scars, tattoos, jewelry)
- Overall aesthetic or vibe

Be specific enough that this description could be used to maintain visual consistency when generating new images of this character in different scenes.`,

      world: `Analyze this environment/world image. Describe in detail:
- Setting type (interior/exterior, urban/natural, fantasy/realistic)
- Key architectural or natural features
- Color palette and lighting conditions
- Atmosphere and mood
- Scale and perspective
- Notable objects or landmarks
- Time of day or weather if visible
- Art style or visual aesthetic

Be specific enough that this description could be used to maintain visual consistency when generating new images set in this world.`,

      object: `Analyze this object/prop image. Describe in detail:
- Type of object and its purpose
- Shape, size (relative scale), and proportions
- Material and texture
- Color and finish (matte, glossy, worn, new)
- Any text, symbols, or markings
- Unique design features
- Style (modern, vintage, futuristic, etc.)

Be specific enough that this description could be used to maintain visual consistency when including this object in generated scenes.`,

      style: `Analyze this image's artistic style. Describe in detail:
- Art style category (photorealistic, illustration, anime, painterly, etc.)
- Color palette and saturation levels
- Lighting style and contrast
- Line work and detail level
- Texture and brush stroke characteristics if applicable
- Composition tendencies
- Mood and emotional tone
- Any specific artistic influences or references

Be specific enough that this description could be used as style guidance for generating new images with consistent aesthetics.`,
    }

    const analysisPrompt = typePrompts[entity.entity_type] ||
      'Describe this image in detail, noting all visual characteristics that would help maintain consistency when generating related images.'

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
    const visionContext = response.text()

    // Update entity with vision context
    const { data: updatedEntity, error: updateError } = await sbAdmin
      .from('storyboard_entities')
      .update({
        vision_context: visionContext,
      })
      .eq('id', entityId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating entity:', updateError)
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      visionContext,
      entity: {
        id: updatedEntity.id,
        storyboardId: updatedEntity.storyboard_id,
        entityType: updatedEntity.entity_type,
        entityName: updatedEntity.entity_name,
        entityDescription: updatedEntity.entity_description,
        folderId: updatedEntity.folder_id,
        generationId: updatedEntity.generation_id,
        primaryImageUrl: updatedEntity.primary_image_url,
        visionContext: updatedEntity.vision_context,
        sortOrder: updatedEntity.sort_order,
        createdAt: updatedEntity.created_at,
      }
    })
  } catch (error) {
    console.error('Entity analyze API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
