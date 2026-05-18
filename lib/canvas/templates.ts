// Starter graphs used when the user picks a template from the canvas index.
// Builds the same IR shape that the editor saves back; the server inserts
// the node/edge rows verbatim.

import { CanvasEdge, CanvasNode, newEdge, newNode } from './ir'

export type CanvasTemplate =
  | 'blank'
  | 'image'
  | 'video'
  | 'variations'
  | 'image-to-video'
  | 'ai-commercial'   // production-brief → Seedance, with two empty ref slots

export interface TemplateGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export function buildTemplate(template: CanvasTemplate): TemplateGraph {
  switch (template) {
    case 'image':       return imageTemplate()
    case 'video':       return videoTemplate()
    case 'variations':  return variationsTemplate()
    case 'image-to-video': return imageToVideoTemplate()
    case 'ai-commercial':  return aiCommercialTemplate()
    case 'blank':
    default:            return { nodes: [], edges: [] }
  }
}

// Templates no longer include a dedicated Output node — model nodes
// (image-gen / video-gen / fan-out) display their own generated assets
// directly. Output as a node type still exists in the IR for back-compat
// with canvases saved before this change.

function imageTemplate(): TemplateGraph {
  const p = newNode('text-prompt', { x: 0, y: 80 }, { title: 'Prompt', prompt: '' })
  const m = newNode('image-gen', { x: 320, y: 80 }, { title: 'Image Model' })
  return {
    nodes: [p, m],
    edges: [newEdge(p.id, 'out:prompt', m.id, 'in:prompt')],
  }
}

function videoTemplate(): TemplateGraph {
  const p = newNode('text-prompt', { x: 0, y: 80 }, { title: 'Prompt', prompt: '' })
  const v = newNode('video-gen', { x: 320, y: 80 }, {
    title: 'Video Model',
    params: { duration: 5, resolution: '720p' },
  })
  return {
    nodes: [p, v],
    edges: [newEdge(p.id, 'out:prompt', v.id, 'in:prompt')],
  }
}

function variationsTemplate(): TemplateGraph {
  const p = newNode('text-prompt', { x: 0, y: 80 }, { title: 'Prompt', prompt: '' })
  const m = newNode('image-gen', { x: 320, y: 80 }, { title: 'Image Model' })
  const f = newNode('fan-out', { x: 640, y: 100 }, { title: 'Variations', variations: 4 })
  return {
    nodes: [p, m, f],
    edges: [
      newEdge(p.id, 'out:prompt', m.id, 'in:prompt'),
      newEdge(m.id, 'out:image', f.id, 'in:source'),
    ],
  }
}

// AI commercial scaffold:
//   concept ──┐
//             ▼
//   ref-1 ──► production-brief ──► Seedance 2.0
//   ref-2 ──┘                      ▲
//   ref-1 ─────────────────────────┤   (same refs feed Seedance directly so [Image1] resolves)
//   ref-2 ─────────────────────────┘
//
// User fills the two ref slots + the concept text, then runs.
function aiCommercialTemplate(): TemplateGraph {
  const concept = newNode('text-prompt', { x: 0, y: 80 }, {
    title: 'Concept',
    prompt: '',
  })
  const ref1 = newNode('reference-image', { x: 0, y: 320 }, { title: 'Frame 1' })
  const ref2 = newNode('reference-image', { x: 0, y: 560 }, { title: 'Frame 2' })
  const brief = newNode('production-brief', { x: 360, y: 220 }, {
    title: 'Production Brief',
    targetModel: 'seedance-2.0',
    style: 'cinematic',
    audioFocus: true,
    motionEmphasis: 'standard',
  })
  const seedance = newNode('video-gen', { x: 760, y: 220 }, {
    title: 'Seedance 2.0',
    modelSlug: 'seedance-2.0',
    modelName: 'Seedance 2.0',
    params: {
      duration: 7,
      resolution: '1080p',
      aspect_ratio: '16:9',
      generate_audio: true,
    },
  })
  return {
    nodes: [concept, ref1, ref2, brief, seedance],
    edges: [
      // Concept + storyboard refs into the brief.
      newEdge(concept.id, 'out:prompt', brief.id, 'in:concept'),
      newEdge(ref1.id, 'out:image', brief.id, 'in:storyboard'),
      newEdge(ref2.id, 'out:image', brief.id, 'in:storyboard'),
      // Brief's distilled prompt into Seedance.
      newEdge(brief.id, 'out:prompt', seedance.id, 'in:prompt'),
      // SAME refs into Seedance so [Image1]/[Image2] tokens resolve.
      newEdge(ref1.id, 'out:image', seedance.id, 'in:ref'),
      newEdge(ref2.id, 'out:image', seedance.id, 'in:ref'),
    ],
  }
}

function imageToVideoTemplate(): TemplateGraph {
  const p = newNode('text-prompt', { x: 0, y: 80 }, { title: 'Prompt', prompt: '' })
  const r = newNode('reference-image', { x: 0, y: 380 }, { title: 'Starting frame' })
  const v = newNode('video-gen', { x: 320, y: 200 }, {
    title: 'Video Model',
    params: { duration: 5, resolution: '720p' },
  })
  return {
    nodes: [p, r, v],
    edges: [
      newEdge(p.id, 'out:prompt', v.id, 'in:prompt'),
      newEdge(r.id, 'out:image', v.id, 'in:start'),
    ],
  }
}
