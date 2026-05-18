// GET  /api/canvas/[id]/runs        — list runs for a canvas (newest first)
// POST /api/canvas/[id]/runs        — start a new run (returns { run: { id } })

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import {
  getWhopAuthFromHeaders,
  verifyWhopTokenAndGetProfile,
  hasWhopAuth,
} from '@/lib/whop'

export const runtime = 'nodejs'

async function resolveUserId(): Promise<string | null> {
  if (!(await hasWhopAuth())) return null
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const me = await verifyWhopTokenAndGetProfile(token, hintedId)
    return me.id
  } catch {
    return null
  }
}

async function assertCanvasOwnership(
  canvasId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await sbAdmin
    .from('canvases')
    .select('id')
    .eq('id', canvasId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

interface RunRow {
  id: string
  canvas_id: string
  user_id: string
  status: string
  started_at: string
  ended_at: string | null
  estimated_cost_cents: number
  actual_cost_cents: number
  node_count: number
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await resolveUserId()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const ok = await assertCanvasOwnership(params.id, userId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { data, error } = await sbAdmin
      .from('canvas_runs')
      .select('*')
      .eq('canvas_id', params.id)
      .order('started_at', { ascending: false })
      .limit(100)

    if (error) throw error
    return NextResponse.json({ runs: (data as RunRow[]) || [] })
  } catch (err) {
    console.error('[canvas:runs:list]', err)
    return NextResponse.json({ error: 'failed to list runs' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await resolveUserId()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const ok = await assertCanvasOwnership(params.id, userId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })

    let body: {
      estimatedCostCents?: number
      nodeCount?: number
    } = {}
    try {
      body = (await req.json()) as typeof body
    } catch {
      // body optional
    }

    const { data, error } = await sbAdmin
      .from('canvas_runs')
      .insert({
        canvas_id: params.id,
        user_id: userId,
        status: 'running',
        estimated_cost_cents: Math.max(0, Math.floor(body.estimatedCostCents || 0)),
        node_count: Math.max(0, Math.floor(body.nodeCount || 0)),
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ run: { id: (data as { id: string }).id } })
  } catch (err) {
    console.error('[canvas:runs:create]', err)
    return NextResponse.json({ error: 'failed to start run' }, { status: 500 })
  }
}
