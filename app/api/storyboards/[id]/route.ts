import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

// Helper to transform storyboard row to camelCase
function transformStoryboard(sb: any) {
  return {
    id: sb.id,
    whopUserId: sb.whop_user_id,
    title: sb.title,
    description: sb.description,
    genre: sb.genre,
    mood: sb.mood,
    styleNotes: sb.style_notes,
    conversationId: sb.conversation_id,
    defaultAspectRatio: sb.default_aspect_ratio,
    defaultModelSlug: sb.default_model_slug,
    status: sb.status,
    totalShots: sb.total_shots,
    completedShots: sb.completed_shots,
    createdAt: sb.created_at,
    updatedAt: sb.updated_at,
  }
}

function transformShot(shot: any) {
  return {
    id: shot.id,
    storyboardId: shot.storyboard_id,
    shotNumber: shot.shot_number,
    sortOrder: shot.sort_order,
    title: shot.title,
    description: shot.description,
    cameraAngle: shot.camera_angle,
    cameraMovement: shot.camera_movement,
    durationSeconds: shot.duration_seconds,
    mediaType: shot.media_type,
    generationId: shot.generation_id,
    prompt: shot.prompt,
    modelSlug: shot.model_slug,
    status: shot.status,
    aiSuggestedPrompt: shot.ai_suggested_prompt,
    aiNotes: shot.ai_notes,
    createdAt: shot.created_at,
    updatedAt: shot.updated_at,
    generatedAt: shot.generated_at,
    entities: shot.shot_entity_references?.map((ref: any) => ({
      id: ref.id,
      shotId: ref.shot_id,
      entityId: ref.entity_id,
      role: ref.role,
      notes: ref.notes,
    })) || [],
  }
}

function transformEntity(entity: any) {
  return {
    id: entity.id,
    storyboardId: entity.storyboard_id,
    entityType: entity.entity_type,
    entityName: entity.entity_name,
    entityDescription: entity.entity_description,
    folderId: entity.folder_id,
    generationId: entity.generation_id,
    primaryImageUrl: entity.primary_image_url,
    visionContext: entity.vision_context,
    sortOrder: entity.sort_order,
    createdAt: entity.created_at,
  }
}

// GET /api/storyboards/[id] - Get storyboard with shots and entities
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    // Fetch storyboard
    const { data: storyboard, error: sbError } = await sbAdmin
      .from('storyboards')
      .select('*')
      .eq('id', id)
      .eq('whop_user_id', whop.id)
      .single()

    if (sbError || !storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    // Fetch shots with entity references
    const { data: shots, error: shotsError } = await sbAdmin
      .from('storyboard_shots')
      .select(`
        *,
        shot_entity_references (
          id,
          shot_id,
          entity_id,
          role,
          notes
        )
      `)
      .eq('storyboard_id', id)
      .order('sort_order', { ascending: true })

    if (shotsError) {
      console.error('Error fetching shots:', shotsError)
    }

    // Fetch entities
    const { data: entities, error: entitiesError } = await sbAdmin
      .from('storyboard_entities')
      .select('*')
      .eq('storyboard_id', id)
      .order('sort_order', { ascending: true })

    if (entitiesError) {
      console.error('Error fetching entities:', entitiesError)
    }

    return NextResponse.json({
      storyboard: transformStoryboard(storyboard),
      shots: (shots || []).map(transformShot),
      entities: (entities || []).map(transformEntity),
    })
  } catch (error) {
    console.error('Storyboard API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/storyboards/[id] - Update storyboard
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    // Verify ownership
    const { data: existing } = await sbAdmin
      .from('storyboards')
      .select('id')
      .eq('id', id)
      .eq('whop_user_id', whop.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const body = await request.json()
    const updates: any = {}

    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.genre !== undefined) updates.genre = body.genre
    if (body.mood !== undefined) updates.mood = body.mood
    if (body.styleNotes !== undefined) updates.style_notes = body.styleNotes
    if (body.defaultAspectRatio !== undefined) updates.default_aspect_ratio = body.defaultAspectRatio
    if (body.defaultModelSlug !== undefined) updates.default_model_slug = body.defaultModelSlug
    if (body.status !== undefined) updates.status = body.status
    if (body.conversationId !== undefined) updates.conversation_id = body.conversationId

    const { data: storyboard, error } = await sbAdmin
      .from('storyboards')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating storyboard:', error)
      return NextResponse.json({ error: 'Failed to update storyboard' }, { status: 500 })
    }

    return NextResponse.json({ storyboard: transformStoryboard(storyboard) })
  } catch (error) {
    console.error('Storyboard API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/storyboards/[id] - Delete storyboard
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    // Delete with cascade (shots, entities, references will be deleted automatically)
    const { error } = await sbAdmin
      .from('storyboards')
      .delete()
      .eq('id', id)
      .eq('whop_user_id', whop.id)

    if (error) {
      console.error('Error deleting storyboard:', error)
      return NextResponse.json({ error: 'Failed to delete storyboard' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Storyboard API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
