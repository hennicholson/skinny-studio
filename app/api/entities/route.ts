// GET /api/entities — returns ALL entities owned by the current Whop user,
// across every storyboard they own. The canvas Entity node uses this to let
// users pick from their global entity library without being scoped to a single
// storyboard.
//
// Why a separate endpoint:
// - /api/storyboards/[id]/entities only returns entities for one board.
// - The canvas EntityPickerField needs a flat, cross-board list for the
//   user to choose from, plus a storyboard label per row for context.
//
// Auth/perf:
// - Auth mirrors the existing storyboards route (verifyWhopTokenAndGetProfile).
// - Single round trip: we select storyboards filtered by whop_user_id and use
//   Supabase's relational select to inline the entities. Ordered by entity
//   created_at desc so the most recent entities show first.

import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import {
  verifyWhopTokenAndGetProfile,
  getWhopAuthFromHeaders,
  hasWhopAuth,
} from '@/lib/whop'

export const runtime = 'nodejs'

type EntityType = 'character' | 'world' | 'object' | 'style'

const VALID_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  'character',
  'world',
  'object',
  'style',
])

interface EntityRow {
  id: string
  storyboard_id: string
  entity_type: EntityType | string
  entity_name: string
  entity_description: string | null
  primary_image_url: string | null
  vision_context: string | null
  created_at: string
}

interface StoryboardWithEntities {
  id: string
  title: string | null
  storyboard_entities: EntityRow[] | null
}

interface FlatEntity {
  id: string
  name: string
  type: string
  vision_context: string | null
  image_url: string | null
  storyboard_id: string
  storyboard_title: string | null
  created_at: string
}

export async function GET(request: Request) {
  try {
    const authed = await hasWhopAuth()
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    // Optional ?type=character|world|object|style filter.
    const url = new URL(request.url)
    const rawType = url.searchParams.get('type')
    const typeFilter =
      rawType && VALID_TYPES.has(rawType as EntityType)
        ? (rawType as EntityType)
        : null

    // Single join query: storyboards owned by this user with their entities
    // inlined. Supabase's foreign-table select handles the join in one round
    // trip.
    const { data, error } = await sbAdmin
      .from('storyboards')
      .select(
        `
        id,
        title,
        storyboard_entities (
          id,
          storyboard_id,
          entity_type,
          entity_name,
          entity_description,
          primary_image_url,
          vision_context,
          created_at
        )
      `,
      )
      .eq('whop_user_id', whop.id)

    if (error) {
      console.error('Error fetching global entities:', error)
      return NextResponse.json(
        { error: 'Failed to fetch entities' },
        { status: 500 },
      )
    }

    const storyboards = (data || []) as unknown as StoryboardWithEntities[]

    // Flatten and shape for the picker. We attach the storyboard title to
    // each row so the UI can render a context pill without a second lookup.
    const flat: FlatEntity[] = []
    for (const sb of storyboards) {
      const entities = sb.storyboard_entities || []
      for (const ent of entities) {
        if (typeFilter && ent.entity_type !== typeFilter) continue
        flat.push({
          id: ent.id,
          name: ent.entity_name,
          type: String(ent.entity_type),
          vision_context: ent.vision_context,
          image_url: ent.primary_image_url,
          storyboard_id: ent.storyboard_id,
          storyboard_title: sb.title,
          created_at: ent.created_at,
        })
      }
    }

    // Newest first — matches the rest of the app where recent work bubbles up.
    flat.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    return NextResponse.json({ entities: flat })
  } catch (error) {
    console.error('Entities (global) API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
