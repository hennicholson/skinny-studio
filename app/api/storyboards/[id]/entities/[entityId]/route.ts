import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

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

// GET /api/storyboards/[id]/entities/[entityId]
export async function GET(
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

    const { data: entity, error } = await sbAdmin
      .from('storyboard_entities')
      .select('*')
      .eq('id', entityId)
      .eq('storyboard_id', id)
      .single()

    if (error || !entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    return NextResponse.json({ entity: transformEntity(entity) })
  } catch (error) {
    console.error('Entity API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/storyboards/[id]/entities/[entityId]
export async function PATCH(
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

    const body = await request.json()
    const updates: any = {}

    if (body.entityName !== undefined) updates.entity_name = body.entityName
    if (body.entityDescription !== undefined) updates.entity_description = body.entityDescription
    if (body.entityType !== undefined) updates.entity_type = body.entityType
    if (body.primaryImageUrl !== undefined) updates.primary_image_url = body.primaryImageUrl
    if (body.visionContext !== undefined) updates.vision_context = body.visionContext
    if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder

    const { data: entity, error } = await sbAdmin
      .from('storyboard_entities')
      .update(updates)
      .eq('id', entityId)
      .eq('storyboard_id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating entity:', error)
      return NextResponse.json({ error: 'Failed to update entity' }, { status: 500 })
    }

    return NextResponse.json({ entity: transformEntity(entity) })
  } catch (error) {
    console.error('Entity API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/storyboards/[id]/entities/[entityId]
export async function DELETE(
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

    // This will cascade delete shot_entity_references
    const { error } = await sbAdmin
      .from('storyboard_entities')
      .delete()
      .eq('id', entityId)
      .eq('storyboard_id', id)

    if (error) {
      console.error('Error deleting entity:', error)
      return NextResponse.json({ error: 'Failed to delete entity' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Entity API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
