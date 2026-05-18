// Bridges the canvas graph into a string the Creative Director can reason
// about. The Director is tool-using now — it needs enough detail to
// reference any node by short id and to know what's actually inside the
// images / prompts / models the user has put down. Kept terse where
// possible (token-sensitive) but rich where the AI needs context.

import { Canvas, CanvasNode, NODE_TYPES } from './ir'

export function describeCanvasForOrchestrator(canvas: Canvas): string {
  if (canvas.nodes.length === 0) return 'Canvas is empty.'

  const lines: string[] = []
  lines.push(`Canvas: "${canvas.title || 'Untitled'}"`)
  lines.push(`${canvas.nodes.length} nodes, ${canvas.edges.length} connections.`)
  lines.push('')

  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  lines.push('Nodes:')
  for (const n of canvas.nodes) {
    lines.push(describeNode(n))
  }

  if (canvas.edges.length > 0) {
    lines.push('')
    lines.push('Wiring:')
    for (const e of canvas.edges) {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (!s || !t) continue
      lines.push(`  ${shortLabel(s)} [${e.sourceHandle}] -> ${shortLabel(t)} [${e.targetHandle}]`)
    }
  }

  return lines.join('\n')
}

function describeNode(n: CanvasNode): string {
  const def = NODE_TYPES[n.type]
  const status = n.data.status !== 'idle' ? ` (${n.data.status})` : ''
  const idTag = `[${n.id.slice(0, 4)}]`
  const titleSuffix = n.data.title ? ` "${n.data.title}"` : ''

  switch (n.type) {
    case 'text-prompt':
      return `- ${idTag} ${def.label}${titleSuffix}${status}: "${truncate(n.data.prompt || '', 140)}"`

    case 'reference-image': {
      // Vision context (auto-analyzed) is the Director's window into WHAT
      // the user uploaded. Surface it inline so the AI can reason about
      // the actual content, not just an opaque URL.
      const vc = (n.data as any).visionContext as string | undefined
      const status_str = n.data.imageUrl ? '[image attached]' : '[empty]'
      const visionLine = vc ? `\n    vision: ${truncate(vc, 220)}` : ''
      return `- ${idTag} ${def.label}${titleSuffix}${status}: ${status_str}${visionLine}`
    }

    case 'reference-video': {
      const videoUrl = (n.data as any).videoUrl as string | undefined
      const status_str = videoUrl ? '[video attached]' : '[empty]'
      return `- ${idTag} ${def.label}${titleSuffix}${status}: ${status_str}`
    }

    case 'entity': {
      const vc = (n.data as any).visionContext as string | undefined
      const visionLine = vc ? `\n    vision: ${truncate(vc, 220)}` : ''
      return `- ${idTag} ${def.label}${titleSuffix}${status}${visionLine}`
    }

    case 'skill':
      return `- ${idTag} ${def.label}${titleSuffix}${status}: "${truncate(n.data.prompt || '', 120)}"`

    case 'image-gen':
    case 'video-gen': {
      const modelLabel = n.data.modelSlug || '[no model selected]'
      const outputs = n.data.outputUrls?.length
        ? ` -> ${n.data.outputUrls.length} output(s)`
        : ''
      const params = n.data.params && Object.keys(n.data.params).length > 0
        ? ` params=${JSON.stringify(n.data.params)}`
        : ''
      return `- ${idTag} ${def.label}${titleSuffix}${status}: ${modelLabel}${params}${outputs}`
    }

    case 'fan-out':
      return `- ${idTag} ${def.label}${titleSuffix}${status}: ${n.data.variations || 4} variations`

    case 'output':
      return `- ${idTag} ${def.label}${titleSuffix}${status}: ${n.data.outputUrls?.length || 0} asset(s)`

    case 'orchestrator':
      return `- ${idTag} ${def.label}${titleSuffix}${status}`

    case 'production-brief': {
      // Surface enough of the distilled output that the Director can reference
      // it back to the user without re-running. brief lives in outputText;
      // distilledPrompt is the 2500-char Seedance shape consumed by downstream
      // video-gen nodes.
      const dp = (n.data as any).distilledPrompt as string | undefined
      const tm = (n.data as any).targetModel || 'seedance-2.0'
      const dpLen = dp?.length ?? 0
      const summary = dp ? `\n    distilled (${dpLen}/2500 chars): "${truncate(dp, 200)}"` : ''
      return `- ${idTag} ${def.label}${titleSuffix}${status}: target=${tm}${summary}`
    }
  }
}

function shortLabel(n: CanvasNode): string {
  return `${NODE_TYPES[n.type].label}:${n.id.slice(0, 4)}`
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
