// GET  /api/canvas/[id]/timeline — load this canvas's timeline doc, or 404.
// PUT  /api/canvas/[id]/timeline — upsert the doc (client sends Partial<Timeline>).
//
// Auth follows the existing canvas route pattern: getWhopAuthFromHeaders +
// verifyWhopTokenAndGetProfile. Ownership is enforced both at the canvas
// level (the queries module joins canvas_timelines → canvases on user_id)
// and at the row level via RLS.

import { NextRequest, NextResponse } from 'next/server'
import {
  getWhopAuthFromHeaders,
  hasWhopAuth,
  verifyWhopTokenAndGetProfile,
} from '@/lib/whop'
import {
  getTimeline,
  upsertTimeline,
} from '@/lib/supabase/timeline-queries'
import type { Timeline } from '@/lib/timeline'

export const runtime = 'nodejs'

async function resolveUserId(): Promise<string | null> {
  if (!(await hasWhopAuth())) return null
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const me = await verifyWhopTokenAndGetProfile(token, hintedId)
    return me?.id ?? null
  } catch {
    return null
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const timeline = await getTimeline(params.id, userId)
    if (!timeline) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ timeline })
  } catch (err) {
    console.error('[timeline:get]', err)
    return NextResponse.json({ error: 'failed to load timeline' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    let body: Partial<Timeline>
    try {
      body = (await req.json()) as Partial<Timeline>
    } catch {
      return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'missing body' }, { status: 400 })
    }

    const timeline = await upsertTimeline(params.id, userId, body)
    return NextResponse.json({ timeline })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    if (msg === 'canvas_not_found_or_unauthorized') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    console.error('[timeline:put]', err)
    return NextResponse.json({ error: 'failed to save timeline' }, { status: 500 })
  }
}
