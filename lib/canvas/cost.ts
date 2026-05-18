// Per-node + per-canvas cost estimation. Mirrors the server-side
// calculateVideoCost() in /api/generate/route.ts so the UI can preview cost
// without round-tripping. Also covers the dynamic-billing case where
// Seedream 4.5 multiplies its flat per-run cost by the number of images.

import { Canvas, CanvasNode } from './ir'

export interface StudioModel {
  slug: string
  pricing_type: 'per_run' | 'per_second'
  cost_per_run_cents?: number
  cost_per_second_cents?: number
  resolution_multipliers?: Record<string, number>
  parameter_schema?: any
  category?: 'image' | 'video'
  name?: string
}

// Hard cap from the server (route.ts uses Math.min(maxImages, 15)).
const SEEDREAM_MAX_IMAGES = 15

/**
 * Nominal per-call cost for Director-style nodes (`orchestrator`,
 * `production-brief`). These route through `/api/chat` rather than Replicate
 * so there's no `studio_models` row to read from. We bill 1¢ as a placeholder
 * so the pre-run cost preview at least surfaces the call instead of showing
 * $0.00 (which made users think the Director was free). Replace this with
 * real metering once `/api/chat` reports token-level usage.
 */
export const DIRECTOR_COST_CENTS = 1

/**
 * Cost of a single image generation node.
 * - Default: flat `cost_per_run_cents`.
 * - Seedream 4.5 with `sequential_image_generation === 'auto'`: multiplies by
 *   `Math.min(params.max_images, 15)`. This matches the server pre-charge
 *   `maxPossibleCost` ceiling (which is the right thing to show the user — the
 *   server may end up billing less if Seedream returns fewer images, but the
 *   UI should preview the worst-case spend so the user can budget).
 */
function estimateImageCost(node: CanvasNode, model: StudioModel): number {
  const flat = model.cost_per_run_cents || 0
  if (model.slug === 'seedream-4.5') {
    const params = node.data.params || {}
    if (params.sequential_image_generation === 'auto') {
      const requested = Number(params.max_images) || 1
      const n = Math.min(Math.max(requested, 1), SEEDREAM_MAX_IMAGES)
      return flat * n
    }
  }
  return flat
}

/**
 * Cost of a single video generation node — mirrors `calculateVideoCost()`:
 * 1. If `pricing_type !== 'per_second'`, fall back to flat per-run cost.
 * 2. Base = `cost_per_second_cents`. If `parameter_schema.generate_audio.pricing`
 *    exists (Veo models), override base with the audio-on or audio-off variant.
 *    Default to audio ON when `params.generate_audio` is undefined.
 * 3. Seedance video-in premium: if `parameter_schema._pricing.per_resolution[res]`
 *    exists AND `params.reference_videos` has ≥1 entry, prefer the
 *    `list_cost_per_second_cents_video_in` row over the standard column.
 * 4. Apply `resolution_multipliers[params.resolution]` (default 1.0).
 * 5. Multiply by `params.duration`.
 * 6. `Math.ceil` the final value.
 */
function estimateVideoCost(node: CanvasNode, model: StudioModel): number {
  if (model.pricing_type !== 'per_second') {
    return model.cost_per_run_cents || 0
  }

  const params = node.data.params || {}
  const schema = model.parameter_schema || {}

  // Mirror server: prefer schema defaults, fall back to common sane values.
  const durationParam = schema.duration
  const resolutionParam = schema.resolution
  const audioParam = schema.generate_audio

  const duration: number =
    Number(params.duration) ||
    Number(durationParam?.default) ||
    5

  const resolution: string =
    (params.resolution as string) ||
    (resolutionParam?.default as string) ||
    '720p'

  let baseCostPerSecond = model.cost_per_second_cents || 0

  // Seedance: `parameter_schema._pricing.per_resolution` carries a per-resolution
  // pricing matrix with a "video-in" premium row used when the run includes
  // `reference_videos`. Prefer that when present (and we have a row for this
  // resolution) so the preview matches what Replicate will actually bill.
  const pricingMatrix = schema._pricing?.per_resolution as Record<string, any> | undefined
  const pricingRow = pricingMatrix?.[resolution]
  if (pricingRow) {
    const refVideos = params.reference_videos
    const hasVideoIn = Array.isArray(refVideos) ? refVideos.length > 0 : !!refVideos
    const cents = hasVideoIn
      ? pricingRow.list_cost_per_second_cents_video_in ?? pricingRow.list_cost_per_second_cents
      : pricingRow.list_cost_per_second_cents
    if (typeof cents === 'number' && cents > 0) baseCostPerSecond = cents
  }

  if (audioParam?.pricing) {
    // Server: `generateAudio !== false`. Mirror exactly — undefined ⇒ true.
    const hasAudio = params.generate_audio !== false
    baseCostPerSecond = hasAudio
      ? audioParam.pricing.with_audio_cents_per_second
      : audioParam.pricing.without_audio_cents_per_second
  }

  const multipliers = model.resolution_multipliers || {}
  const resolutionMultiplier = multipliers[resolution] || 1.0

  return Math.ceil(baseCostPerSecond * duration * resolutionMultiplier)
}

export function estimateNodeCost(node: CanvasNode, model?: StudioModel): number {
  // Director nodes don't have a studio_models row; charge the flat nominal
  // amount so cost preview reflects every billable call.
  if (node.type === 'orchestrator' || node.type === 'production-brief') {
    return DIRECTOR_COST_CENTS
  }

  if (!model) return 0
  if (!node.data.modelSlug && node.type !== 'fan-out') return 0

  if (node.type === 'image-gen') return estimateImageCost(node, model)
  if (node.type === 'video-gen') return estimateVideoCost(node, model)
  if (node.type === 'fan-out') {
    // Cost is N × upstream cost — caller computes upstream separately.
    return 0
  }
  return 0
}

/**
 * Find the cost a fan-out node multiplies. Walks back through the graph
 * skipping any non-billable upstream (text-prompt, reference-image, entity,
 * skill, orchestrator) until it finds a billable producer.
 */
export function findFanOutUpstream(
  canvas: Canvas,
  fanOutNodeId: string,
): CanvasNode | undefined {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  let cursor: string | undefined = fanOutNodeId
  const visited = new Set<string>()

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor)
    const incoming = canvas.edges.find((e) => e.target === cursor)
    if (!incoming) return undefined
    const upstream = byId.get(incoming.source)
    if (!upstream) return undefined
    if (upstream.type === 'image-gen' || upstream.type === 'video-gen') return upstream
    cursor = upstream.id
  }
  return undefined
}

export function estimateCanvasCost(canvas: Canvas, models: Map<string, StudioModel>): number {
  let total = 0
  for (const node of canvas.nodes) {
    if (node.type === 'fan-out') {
      const upstream = findFanOutUpstream(canvas, node.id)
      if (!upstream || !upstream.data.modelSlug) continue
      const upstreamCost = estimateNodeCost(upstream, models.get(upstream.data.modelSlug))
      // The executor runs the upstream once (in its own topo step) and then
      // the fan-out re-runs it N more times. The upstream's solo cost is
      // already accounted for when we iterate the upstream node itself, so
      // here we only add the N variation runs.
      const variations = Math.max(1, Math.min(8, node.data.variations || 4))
      total += upstreamCost * variations
    } else if (node.type === 'orchestrator' || node.type === 'production-brief') {
      // Director nodes — flat nominal cost. No studio_models lookup.
      total += estimateNodeCost(node)
    } else if (node.data.modelSlug) {
      total += estimateNodeCost(node, models.get(node.data.modelSlug))
    }
  }
  return total
}

export function formatCents(cents: number): string {
  if (cents === 0) return 'Free'
  if (cents < 100) return `${cents}¢`
  return `$${(cents / 100).toFixed(2)}`
}
