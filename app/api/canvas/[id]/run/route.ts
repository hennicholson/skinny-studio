// Pre-flight endpoint for kicking off a canvas run.
//
// The actual model calls still happen client-side via /api/generate (so the
// caller's Whop headers flow through), but before kicking off a run the
// client POSTs here to:
//   1. Confirm ownership of the canvas
//   2. Get a topological execution plan + estimated cost
//   3. Verify the user's balance covers it
//
// The route does NOT mutate any state; it logs the run intent to the server
// console (no canvas_runs table) and returns enough metadata for the executor
// to start.

import { NextRequest, NextResponse } from 'next/server'
import {
  getWhopAuthFromHeaders,
  hasWhopAuth,
  verifyWhopTokenAndGetProfile,
} from '@/lib/whop'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getCanvas } from '@/lib/supabase/canvas-queries'
import { topologicalSort } from '@/lib/canvas/executor'
import { estimateCanvasCost, StudioModel } from '@/lib/canvas/cost'

export const runtime = 'nodejs'

interface PlanStep {
  nodeId: string
  type: string
  modelSlug?: string
  estimatedCostCents: number
}

async function resolveUserAndProfile() {
  if (!(await hasWhopAuth())) return null
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const me = await verifyWhopTokenAndGetProfile(token, hintedId)
    if (!me?.id) return null

    const { data: profile } = await sbAdmin
      .from('user_profiles')
      .select('id, balance_cents, lifetime_access')
      .eq('whop_user_id', me.id)
      .maybeSingle()

    return {
      whopUserId: me.id,
      profileId: profile?.id || null,
      balanceCents: profile?.balance_cents || 0,
      lifetimeAccess: !!profile?.lifetime_access,
    }
  } catch {
    return null
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveUserAndProfile()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const loaded = await getCanvas(params.id, user.whopUserId)
    if (!loaded) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const canvas = loaded.canvas

    // Topologically order so the client knows the execution path. Throws on a
    // cycle.
    let ordered
    try {
      ordered = topologicalSort(canvas.nodes, canvas.edges)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'cycle in graph'
      return NextResponse.json(
        { error: 'invalid graph', detail: msg },
        { status: 400 },
      )
    }

    // Load studio_models for every modelSlug referenced in the canvas so we
    // can estimate cost using the same logic as the server's billing path.
    const referencedSlugs: string[] = Array.from(
      new Set(
        canvas.nodes
          .map((n) => n.data.modelSlug)
          .filter((s): s is string => typeof s === 'string' && s.length > 0),
      ),
    )

    const modelMap = new Map<string, StudioModel>()
    if (referencedSlugs.length > 0) {
      const { data: rows, error } = await sbAdmin
        .from('studio_models')
        .select(
          'slug, pricing_type, cost_per_run_cents, cost_per_second_cents, resolution_multipliers, parameter_schema, category',
        )
        .in('slug', referencedSlugs)

      if (error) {
        console.error('[canvas:run] studio_models fetch error', error)
      } else {
        for (const r of rows || []) {
          modelMap.set(r.slug, r as StudioModel)
        }
      }
    }

    const estimatedCostCents = estimateCanvasCost(canvas, modelMap)

    const plan: PlanStep[] = ordered.map((node) => ({
      nodeId: node.id,
      type: node.type,
      modelSlug: node.data.modelSlug,
      estimatedCostCents:
        node.data.modelSlug && modelMap.has(node.data.modelSlug)
          ? singleNodeCost(node, modelMap.get(node.data.modelSlug)!)
          : 0,
    }))

    const sufficient =
      user.lifetimeAccess || user.balanceCents >= estimatedCostCents

    console.log(
      `[canvas:run] user=${user.whopUserId} canvas=${canvas.id} nodes=${canvas.nodes.length} estCost=${estimatedCostCents}c balance=${user.balanceCents}c lifetime=${user.lifetimeAccess} ok=${sufficient}`,
    )

    if (!sufficient) {
      return NextResponse.json(
        {
          ok: false,
          error: 'INSUFFICIENT_BALANCE',
          estimatedCostCents,
          balanceCents: user.balanceCents,
          plan,
        },
        { status: 402 },
      )
    }

    return NextResponse.json({
      ok: true,
      estimatedCostCents,
      balanceCents: user.balanceCents,
      lifetimeAccess: user.lifetimeAccess,
      plan,
    })
  } catch (err) {
    console.error('[canvas:run] failed', err)
    return NextResponse.json(
      { error: 'failed to plan run' },
      { status: 500 },
    )
  }
}

// Mirrors estimateNodeCost but kept inline so we can return a per-node figure
// alongside the plan without expanding lib/canvas/cost.ts's surface.
function singleNodeCost(
  node: { type: string; data: { params?: Record<string, any> } },
  model: StudioModel,
): number {
  if (node.type === 'image-gen') {
    return model.cost_per_run_cents || 0
  }
  if (node.type === 'video-gen') {
    if (model.pricing_type !== 'per_second') return model.cost_per_run_cents || 0
    const p = node.data.params || {}
    const duration: number = p.duration ?? 5
    const resolution: string = p.resolution ?? '720p'
    const generateAudio: boolean = p.generate_audio ?? true

    let base = model.cost_per_second_cents || 0
    const audioParam = model.parameter_schema?.generate_audio
    if (audioParam?.pricing) {
      base = generateAudio
        ? audioParam.pricing.with_audio_cents_per_second
        : audioParam.pricing.without_audio_cents_per_second
    }
    const mult = (model.resolution_multipliers || {})[resolution] || 1
    return Math.ceil(base * duration * mult)
  }
  return 0
}
