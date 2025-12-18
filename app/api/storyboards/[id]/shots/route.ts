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
    entities: [],
  }
}

// GET /api/storyboards/[id]/shots - List shots
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

    // Verify ownership
    const { data: storyboard } = await sbAdmin
      .from('storyboards')
      .select('id')
      .eq('id', id)
      .eq('whop_user_id', whop.id)
      .single()

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const { data: shots, error } = await sbAdmin
      .from('storyboard_shots')
      .select('*')
      .eq('storyboard_id', id)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching shots:', error)
      return NextResponse.json({ error: 'Failed to fetch shots' }, { status: 500 })
    }

    return NextResponse.json({ shots: (shots || []).map(transformShot) })
  } catch (error) {
    console.error('Shots API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/storyboards/[id]/shots - Add shot(s)
export async function POST(
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
    const { data: storyboard } = await sbAdmin
      .from('storyboards')
      .select('id, total_shots')
      .eq('id', id)
      .eq('whop_user_id', whop.id)
      .single()

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const body = await request.json()

    // Handle bulk insert from AI
    if (body.bulk && Array.isArray(body.shots)) {
      const shotsToInsert = body.shots.map((shot: any, index: number) => ({
        storyboard_id: id,
        shot_number: storyboard.total_shots + index + 1,
        sort_order: storyboard.total_shots + index,
        title: shot.title,
        description: shot.description,
        camera_angle: shot.cameraAngle,
        camera_movement: shot.cameraMovement,
        duration_seconds: shot.durationSeconds || 5,
        media_type: shot.mediaType || 'image',
        ai_suggested_prompt: shot.aiSuggestedPrompt,
        ai_notes: shot.aiNotes,
        status: 'pending',
      }))

      const { data: newShots, error } = await sbAdmin
        .from('storyboard_shots')
        .insert(shotsToInsert)
        .select()

      if (error) {
        console.error('Error bulk inserting shots:', error)
        return NextResponse.json({ error: 'Failed to add shots' }, { status: 500 })
      }

      // Update total_shots count
      await sbAdmin
        .from('storyboards')
        .update({ total_shots: storyboard.total_shots + body.shots.length })
        .eq('id', id)

      return NextResponse.json({ shots: (newShots || []).map(transformShot) }, { status: 201 })
    }

    // Single shot insert
    const {
      title,
      description,
      cameraAngle,
      cameraMovement,
      durationSeconds = 5,
      mediaType = 'image',
      aiSuggestedPrompt,
      aiNotes,
    } = body

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const { data: newShot, error } = await sbAdmin
      .from('storyboard_shots')
      .insert({
        storyboard_id: id,
        shot_number: storyboard.total_shots + 1,
        sort_order: storyboard.total_shots,
        title,
        description,
        camera_angle: cameraAngle,
        camera_movement: cameraMovement,
        duration_seconds: durationSeconds,
        media_type: mediaType,
        ai_suggested_prompt: aiSuggestedPrompt,
        ai_notes: aiNotes,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting shot:', error)
      return NextResponse.json({ error: 'Failed to add shot' }, { status: 500 })
    }

    // Update total_shots count
    await sbAdmin
      .from('storyboards')
      .update({ total_shots: storyboard.total_shots + 1 })
      .eq('id', id)

    return NextResponse.json({ shot: transformShot(newShot) }, { status: 201 })
  } catch (error) {
    console.error('Shots API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
