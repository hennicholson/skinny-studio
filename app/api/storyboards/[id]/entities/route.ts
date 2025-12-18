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

// GET /api/storyboards/[id]/entities - List entities
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

    const { data: entities, error } = await sbAdmin
      .from('storyboard_entities')
      .select('*')
      .eq('storyboard_id', id)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching entities:', error)
      return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 })
    }

    return NextResponse.json({ entities: (entities || []).map(transformEntity) })
  } catch (error) {
    console.error('Entities API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/storyboards/[id]/entities - Add entity
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
      .select('id')
      .eq('id', id)
      .eq('whop_user_id', whop.id)
      .single()

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const {
      entityType,
      entityName,
      entityDescription,
      folderId,
      generationId,
      imageUrl,
    } = await request.json()

    if (!entityType || !entityName) {
      return NextResponse.json({ error: 'entityType and entityName are required' }, { status: 400 })
    }

    // Get current count for sort_order
    const { count } = await sbAdmin
      .from('storyboard_entities')
      .select('id', { count: 'exact' })
      .eq('storyboard_id', id)

    const { data: entity, error } = await sbAdmin
      .from('storyboard_entities')
      .insert({
        storyboard_id: id,
        entity_type: entityType,
        entity_name: entityName,
        entity_description: entityDescription,
        folder_id: folderId,
        generation_id: generationId,
        primary_image_url: imageUrl,
        sort_order: count || 0,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating entity:', error)
      return NextResponse.json({ error: 'Failed to create entity' }, { status: 500 })
    }

    return NextResponse.json({ entity: transformEntity(entity) }, { status: 201 })
  } catch (error) {
    console.error('Entities API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
