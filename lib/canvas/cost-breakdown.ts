// Per-node cost breakdown for the canvas. Produces a flat table-ready list
// of rows whose `costCents` values sum to `estimateCanvasCost()`.
//
// Designed for UI consumption — each row has a human label plus an optional
// `note` explaining variable-cost math (e.g. "5s × 60¢ × 1.5 (1080p)" or
// "4× upstream (fan-out)").

import { Canvas, CanvasNode, NodeType } from './ir'
import {
  StudioModel,
  estimateNodeCost,
  findFanOutUpstream,
  formatCents,
  DIRECTOR_COST_CENTS,
} from './cost'

export interface NodeCostRow {
  nodeId: string
  nodeType: NodeType
  modelSlug?: string
  label: string
  costCents: number
  note?: string
}

const TYPE_LABEL: Record<NodeType, string> = {
  'text-prompt': 'Prompt',
  'reference-image': 'Reference',
  entity: 'Entity',
  skill: 'Skill',
  'image-gen': 'Image Model',
  'video-gen': 'Video Model',
  'fan-out': 'Fan-out',
  output: 'Output',
  orchestrator: 'Creative Director',
  'production-brief': 'Production Brief',
}

function nodeLabel(node: CanvasNode): string {
  if (node.data.title?.trim()) return node.data.title.trim()
  if (node.data.modelName?.trim()) return node.data.modelName.trim()
  return TYPE_LABEL[node.type] || node.type
}

function videoNote(node: CanvasNode, model: StudioModel): string | undefined {
  if (model.pricing_type !== 'per_second') return undefined
  const p = node.data.params || {}
  const schema = model.parameter_schema || {}
  const duration: number =
    Number(p.duration) || Number(schema.duration?.default) || 5
  const resolution: string =
    (p.resolution as string) || (schema.resolution?.default as string) || '720p'
  const audioParam = schema.generate_audio

  let perSec = model.cost_per_second_cents || 0
  let audioFragment = ''
  let videoInFragment = ''

  // Seedance "video-in" premium — when reference_videos is set the
  // per-second rate jumps. Mirror estimateVideoCost so the popover labels
  // the math the user will actually be charged.
  const pricingRow = (model.parameter_schema?._pricing?.per_resolution as Record<string, any> | undefined)?.[resolution]
  if (pricingRow) {
    const refVideos = p.reference_videos
    const hasVideoIn = Array.isArray(refVideos) ? refVideos.length > 0 : !!refVideos
    const cents = hasVideoIn
      ? pricingRow.list_cost_per_second_cents_video_in ?? pricingRow.list_cost_per_second_cents
      : pricingRow.list_cost_per_second_cents
    if (typeof cents === 'number' && cents > 0) {
      perSec = cents
      if (hasVideoIn) videoInFragment = ' (video-in)'
    }
  }

  if (audioParam?.pricing) {
    const hasAudio = p.generate_audio !== false
    perSec = hasAudio
      ? audioParam.pricing.with_audio_cents_per_second
      : audioParam.pricing.without_audio_cents_per_second
    audioFragment = hasAudio ? ' (audio)' : ' (no audio)'
  }

  const mult = (model.resolution_multipliers || {})[resolution] || 1
  const multFragment = mult !== 1 ? ` × ${mult} (${resolution})` : ` (${resolution})`
  return `${duration}s × ${formatCents(perSec)}/s${multFragment}${audioFragment}${videoInFragment}`
}

function imageNote(node: CanvasNode, model: StudioModel): string | undefined {
  if (model.slug === 'seedream-4.5') {
    const p = node.data.params || {}
    if (p.sequential_image_generation === 'auto') {
      const n = Math.min(Math.max(Number(p.max_images) || 1, 1), 15)
      if (n > 1) {
        return `${n}× ${formatCents(model.cost_per_run_cents || 0)} (sequential, max ${n})`
      }
    }
  }
  return undefined
}

/**
 * Produce one row per billable node (skips inputs, output, orchestrator).
 * Fan-out emits its OWN row whose cost is `variations × upstream cost`; the
 * upstream model node still gets its solo row, matching `estimateCanvasCost`.
 */
export function breakdownCanvas(
  canvas: Canvas,
  models: Map<string, StudioModel>,
): NodeCostRow[] {
  const rows: NodeCostRow[] = []

  for (const node of canvas.nodes) {
    if (node.type === 'orchestrator' || node.type === 'production-brief') {
      // Director nodes: nominal flat cost, no studio_models row. Surface a row
      // so users see "where their money goes" — until /api/chat has real
      // metering, this matches DIRECTOR_COST_CENTS exactly.
      rows.push({
        nodeId: node.id,
        nodeType: node.type,
        label: nodeLabel(node),
        costCents: DIRECTOR_COST_CENTS,
        note:
          node.type === 'orchestrator'
            ? 'Director call (nominal)'
            : 'Director call (production brief, nominal)',
      })
      continue
    }

    if (node.type === 'fan-out') {
      const upstream = findFanOutUpstream(canvas, node.id)
      if (!upstream || !upstream.data.modelSlug) {
        rows.push({
          nodeId: node.id,
          nodeType: node.type,
          label: nodeLabel(node),
          costCents: 0,
          note: 'No source connected',
        })
        continue
      }
      const upstreamModel = models.get(upstream.data.modelSlug)
      if (!upstreamModel) continue
      const upstreamCost = estimateNodeCost(upstream, upstreamModel)
      const variations = Math.max(1, Math.min(8, node.data.variations || 4))
      rows.push({
        nodeId: node.id,
        nodeType: node.type,
        modelSlug: upstream.data.modelSlug,
        label: nodeLabel(node),
        costCents: upstreamCost * variations,
        note: `${variations}× ${formatCents(upstreamCost)} (${nodeLabel(upstream)})`,
      })
      continue
    }

    if (!node.data.modelSlug) continue
    const model = models.get(node.data.modelSlug)
    if (!model) continue

    const cost = estimateNodeCost(node, model)
    if (cost === 0 && node.type !== 'image-gen' && node.type !== 'video-gen') continue

    rows.push({
      nodeId: node.id,
      nodeType: node.type,
      modelSlug: node.data.modelSlug,
      label: nodeLabel(node),
      costCents: cost,
      note:
        node.type === 'video-gen'
          ? videoNote(node, model)
          : node.type === 'image-gen'
            ? imageNote(node, model)
            : undefined,
    })
  }

  return rows
}
