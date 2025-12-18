import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

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
  }
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

// GET /api/storyboards/[id]/shots/[shotId] - Get single shot
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

    const { data: shot, error } = await sbAdmin
      .from('storyboard_shots')
      .select('*')
      .eq('id', shotId)
      .eq('storyboard_id', id)
      .single()

    if (error || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
    }

    return NextResponse.json({ shot: transformShot(shot) })
  } catch (error) {
    console.error('Shot API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/storyboards/[id]/shots/[shotId] - Update shot
export async function PATCH(
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
    const updates: any = {}

    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.cameraAngle !== undefined) updates.camera_angle = body.cameraAngle
    if (body.cameraMovement !== undefined) updates.camera_movement = body.cameraMovement
    if (body.durationSeconds !== undefined) updates.duration_seconds = body.durationSeconds
    if (body.mediaType !== undefined) updates.media_type = body.mediaType
    if (body.prompt !== undefined) updates.prompt = body.prompt
    if (body.modelSlug !== undefined) updates.model_slug = body.modelSlug
    if (body.status !== undefined) updates.status = body.status
    if (body.aiSuggestedPrompt !== undefined) updates.ai_suggested_prompt = body.aiSuggestedPrompt
    if (body.aiNotes !== undefined) updates.ai_notes = body.aiNotes
    if (body.generationId !== undefined) updates.generation_id = body.generationId
    if (body.generatedAt !== undefined) updates.generated_at = body.generatedAt

    const { data: shot, error } = await sbAdmin
      .from('storyboard_shots')
      .update(updates)
      .eq('id', shotId)
      .eq('storyboard_id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating shot:', error)
      return NextResponse.json({ error: 'Failed to update shot' }, { status: 500 })
    }

    // If status changed to completed, update storyboard completed_shots
    if (body.status === 'completed') {
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

    return NextResponse.json({ shot: transformShot(shot) })
  } catch (error) {
    console.error('Shot API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/storyboards/[id]/shots/[shotId] - Delete shot
export async function DELETE(
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

    const { error } = await sbAdmin
      .from('storyboard_shots')
      .delete()
      .eq('id', shotId)
      .eq('storyboard_id', id)

    if (error) {
      console.error('Error deleting shot:', error)
      return NextResponse.json({ error: 'Failed to delete shot' }, { status: 500 })
    }

    // Update total_shots count
    const { data: remaining } = await sbAdmin
      .from('storyboard_shots')
      .select('id', { count: 'exact' })
      .eq('storyboard_id', id)

    await sbAdmin
      .from('storyboards')
      .update({ total_shots: remaining?.length || 0 })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Shot API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
