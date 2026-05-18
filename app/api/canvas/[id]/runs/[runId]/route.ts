// GET   /api/canvas/[id]/runs/[runId]  — full run + per-node detail
// PATCH /api/canvas/[id]/runs/[runId]  — finalize / update a run

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
  const { data, error } = await sbAdmin
    .from('canvas_runs')
    .select('id, canvas_id, canvases!inner(user_id)')
    .eq('id', runId)
    .eq('canvas_id', canvasId)
    .maybeSingle()

  if (error) {
    // Fallback path if the implicit join fails (e.g. PostgREST schema cache).
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

  if (!data) return false
  const joined = data as unknown as {
    canvases: { user_id: string } | { user_id: string }[]
  }
  const owner = Array.isArray(joined.canvases)
    ? joined.canvases[0]?.user_id
    : joined.canvases?.user_id
  return owner === userId
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

interface RunNodeRow {
  id: string
  run_id: string
  canvas_node_id: string | null
  client_node_id: string
  generation_id: string | null
  status: string
  cost_cents: number
  started_at: string | null
  ended_at: string | null
  error: string | null
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

    const [{ data: runRow, error: runErr }, { data: nodeRows, error: nodeErr }] =
      await Promise.all([
        sbAdmin
          .from('canvas_runs')
          .select('*')
          .eq('id', params.runId)
          .single(),
        sbAdmin
          .from('canvas_run_nodes')
          .select('*')
          .eq('run_id', params.runId)
          .order('started_at', { ascending: true, nullsFirst: true }),
      ])

    if (runErr) throw runErr
    if (nodeErr) throw nodeErr

    const nodes = (nodeRows as RunNodeRow[]) || []

    // Hydrate generation outputs (one query) so the client can render thumbnails.
    const generationIds = nodes
      .map((n) => n.generation_id)
      .filter((g): g is string => !!g)

    let generationsById: Record<
      string,
      { id: string; output_urls: string[] | null; replicate_status: string | null; cost_cents: number | null }
    > = {}

    if (generationIds.length > 0) {
      const { data: gens } = await sbAdmin
        .from('generations')
        .select('id, output_urls, replicate_status, cost_cents')
        .in('id', generationIds)
      if (gens) {
        for (const g of gens as Array<{
          id: string
          output_urls: string[] | null
          replicate_status: string | null
          cost_cents: number | null
        }>) {
          generationsById[g.id] = g
        }
      }
    }

    return NextResponse.json({
      run: runRow as RunRow,
      nodes,
      generations: generationsById,
    })
  } catch (err) {
    console.error('[canvas:run:get]', err)
    return NextResponse.json({ error: 'failed to load run' }, { status: 500 })
  }
}

export async function PATCH(
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

    let body: {
      status?: 'running' | 'succeeded' | 'failed' | 'cancelled'
      endedAt?: string | null
      actualCostCents?: number
      nodeCount?: number
    } = {}
    try {
      body = (await req.json()) as typeof body
    } catch {
      // tolerate empty body
    }

    const patch: Record<string, unknown> = {}
    if (body.status) patch.status = body.status
    if (body.endedAt !== undefined) patch.ended_at = body.endedAt
    if (typeof body.actualCostCents === 'number') {
      patch.actual_cost_cents = Math.max(0, Math.floor(body.actualCostCents))
    }
    if (typeof body.nodeCount === 'number') {
      patch.node_count = Math.max(0, Math.floor(body.nodeCount))
    }
    // Auto-stamp ended_at on terminal states if not provided.
    if (
      body.status &&
      body.status !== 'running' &&
      body.endedAt === undefined
    ) {
      patch.ended_at = new Date().toISOString()
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, noop: true })
    }

    const { error } = await sbAdmin
      .from('canvas_runs')
      .update(patch)
      .eq('id', params.runId)
      .eq('canvas_id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[canvas:run:patch]', err)
    return NextResponse.json({ error: 'failed to update run' }, { status: 500 })
  }
}

// PUT mirrors PATCH for clients that prefer it.
export const PUT = PATCH
