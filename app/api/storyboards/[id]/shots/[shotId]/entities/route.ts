import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

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

function transformReference(ref: any) {
  return {
    id: ref.id,
    shotId: ref.shot_id,
    entityId: ref.entity_id,
    role: ref.role,
    notes: ref.notes,
    entity: ref.storyboard_entities ? {
      id: ref.storyboard_entities.id,
      entityType: ref.storyboard_entities.entity_type,
      entityName: ref.storyboard_entities.entity_name,
      primaryImageUrl: ref.storyboard_entities.primary_image_url,
      visionContext: ref.storyboard_entities.vision_context,
    } : undefined,
  }
}

// GET /api/storyboards/[id]/shots/[shotId]/entities
// List all entities assigned to this shot
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

    // Verify shot exists
    const { data: shot } = await sbAdmin
      .from('storyboard_shots')
      .select('id')
      .eq('id', shotId)
      .eq('storyboard_id', id)
      .single()

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
    }

    // Get entity references with entity details
    const { data: references, error } = await sbAdmin
      .from('shot_entity_references')
      .select(`
        *,
        storyboard_entities (
          id,
          entity_type,
          entity_name,
          primary_image_url,
          vision_context
        )
      `)
      .eq('shot_id', shotId)

    if (error) {
      console.error('Error fetching shot entities:', error)
      return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 })
    }

    return NextResponse.json({
      entities: (references || []).map(transformReference)
    })
  } catch (error) {
    console.error('Shot entities API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/storyboards/[id]/shots/[shotId]/entities
// Assign an entity to this shot
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

    const { entityId, role, notes } = await request.json()

    if (!entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
    }

    // Verify shot exists
    const { data: shot } = await sbAdmin
      .from('storyboard_shots')
      .select('id')
      .eq('id', shotId)
      .eq('storyboard_id', id)
      .single()

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
    }

    // Verify entity exists and belongs to this storyboard
    const { data: entity } = await sbAdmin
      .from('storyboard_entities')
      .select('id')
      .eq('id', entityId)
      .eq('storyboard_id', id)
      .single()

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Create reference (upsert to handle duplicates gracefully)
    const { data: reference, error } = await sbAdmin
      .from('shot_entity_references')
      .upsert({
        shot_id: shotId,
        entity_id: entityId,
        role: role || 'primary',
        notes,
      }, {
        onConflict: 'shot_id,entity_id',
      })
      .select(`
        *,
        storyboard_entities (
          id,
          entity_type,
          entity_name,
          primary_image_url,
          vision_context
        )
      `)
      .single()

    if (error) {
      console.error('Error assigning entity to shot:', error)
      return NextResponse.json({ error: 'Failed to assign entity' }, { status: 500 })
    }

    return NextResponse.json({
      reference: transformReference(reference)
    }, { status: 201 })
  } catch (error) {
    console.error('Shot entities API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/storyboards/[id]/shots/[shotId]/entities
// Remove an entity from this shot
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

    const { entityId } = await request.json()

    if (!entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
    }

    const { error } = await sbAdmin
      .from('shot_entity_references')
      .delete()
      .eq('shot_id', shotId)
      .eq('entity_id', entityId)

    if (error) {
      console.error('Error removing entity from shot:', error)
      return NextResponse.json({ error: 'Failed to remove entity' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Shot entities API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
