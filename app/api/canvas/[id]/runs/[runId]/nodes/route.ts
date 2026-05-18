// POST /api/canvas/[id]/runs/[runId]/nodes
//   Append a canvas_run_nodes row. Called by the client as nodes execute.
//
// GET /api/canvas/[id]/runs/[runId]/nodes
//   List all node records for a run (used as a fallback / debug surface).

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

async function assertRunOwnership(
  canvasId: string,
  runId: string,
  userId: string,
): Promise<boolean> {
  // Two cheap queries; no implicit join required.
  const { data: runRow } = await sbAdmin
    .from('canvas_runs')
    .select('id, canvas_id')
    .eq('id', runId)
    .eq('canvas_id', canvasId)
    .maybeSingle()
  if (!runRow) return false
  const { data: canvasRow } = await sbAdmin
    .from('canvases')
    .select('id')
    .eq('id', canvasId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!canvasRow
}

interface AppendNodeBody {
  canvasNodeId?: string | null
  clientNodeId: string
  generationId?: string | null
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped'
  costCents?: number
  startedAt?: string | null
  endedAt?: string | null
  error?: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; runId: string } },
) {
  const userId = await resolveUserId()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const ok = await assertRunOwnership(params.id, params.runId, userId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const body = (await req.json()) as AppendNodeBody
    if (!body?.clientNodeId) {
      return NextResponse.json(
        { error: 'missing clientNodeId' },
        { status: 400 },
      )
    }

    const { data, error } = await sbAdmin
      .from('canvas_run_nodes')
      .insert({
        run_id: params.runId,
        canvas_node_id: body.canvasNodeId || null,
        client_node_id: body.clientNodeId,
        generation_id: body.generationId || null,
        status: body.status || 'queued',
        cost_cents: Math.max(0, Math.floor(body.costCents || 0)),
        started_at: body.startedAt || null,
        ended_at: body.endedAt || null,
        error: body.error || null,
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ node: { id: (data as { id: string }).id } })
  } catch (err) {
    console.error('[canvas:run:nodes:create]', err)
    return NextResponse.json(
      { error: 'failed to record node' },
      { status: 500 },
    )
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; runId: string } },
) {
  const userId = await resolveUserId()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const ok = await assertRunOwnership(params.id, params.runId, userId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { data, error } = await sbAdmin
      .from('canvas_run_nodes')
      .select('*')
      .eq('run_id', params.runId)
      .order('started_at', { ascending: true, nullsFirst: true })
    if (error) throw error
    return NextResponse.json({ nodes: data || [] })
  } catch (err) {
    console.error('[canvas:run:nodes:list]', err)
    return NextResponse.json(
      { error: 'failed to list run nodes' },
      { status: 500 },
    )
  }
}
