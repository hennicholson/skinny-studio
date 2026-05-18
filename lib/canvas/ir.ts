// Canvas Intermediate Representation.
// Pure data; no runtime, no React. Used by the editor, the executor, and the
// persistence layer. Shape mirrors what we store in Supabase 1:1 so we can
// hydrate without a transform step.

export type NodeType =
  | 'text-prompt'
  | 'reference-image'
  | 'entity'
  | 'skill'
  | 'image-gen'
  | 'video-gen'
  | 'fan-out'
  | 'output'
  | 'orchestrator'
  | 'production-brief'

export type HandleType =
  | 'prompt'   // string
  | 'image'    // single image URL
  | 'images'   // array of image URLs (for ref/ingredient arrays)
  | 'video'    // single video URL
  | 'entity'   // { name, type, visionContext, imageUrl }
  | 'any'      // accepts anything (orchestrator input)

export type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'

export interface HandleDef {
  id: string             // local-to-node, e.g. 'in:ref', 'out:image'
  label: string
  type: HandleType
  multi?: boolean        // accepts multiple incoming edges (e.g. ref array)
}

export interface CanvasNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: {
    title?: string
    // Model node specifics
    modelSlug?: string                       // FK to studio_models.slug
    modelName?: string                       // human-readable label for the model
    params?: Record<string, any>
    // Static input node specifics
    prompt?: string                          // text-prompt
    imageUrl?: string                        // reference-image
    entityId?: string                        // entity
    visionContext?: string                   // entity — description used as out:prompt
    skillId?: string                         // skill
    // Fan-out specifics
    variations?: number
    // Production-brief specifics
    targetModel?: string                     // e.g. 'seedance-2.0' (default), 'gpt-image-2'
    style?: 'cinematic' | 'commercial' | 'documentary' | 'music-video' | 'animatic'
    audioFocus?: boolean                     // when true the distilled prompt includes dialogue/SFX/BGM cues
    motionEmphasis?: 'subtle' | 'standard' | 'dynamic'
    extraNotes?: string                      // optional user free-form direction
    distilledPrompt?: string                 // the truncated 2500-char shape served on out:prompt
    // Runtime
    status: NodeStatus
    outputUrls?: string[]                    // image[]/video for the CURRENT entry (mirrors generationHistory[historyIndex].urls)
    outputText?: string                      // text emitted (orchestrator/prompt)
    error?: string
    costCents?: number
    generationId?: string                    // FK to generations after run

    // Per-node generation history — Runway-style. Each successive run pushes
    // a new entry at index 0 (newest first). The node displays whichever
    // entry `historyIndex` points at; users can flip with the < 1/N >
    // chevrons inside the node and label each one independently.
    generationHistory?: GenerationEntry[]
    historyIndex?: number
  }
}

/** One past generation produced by a model node. Persisted in data_json. */
export interface GenerationEntry {
  urls: string[]               // replicate / supabase storage URLs
  label?: string               // user-editable, defaults to time-of-run
  generationId?: string        // FK to generations table
  costCents?: number
  completedAt: string          // ISO8601
}

export interface CanvasEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface Canvas {
  id: string
  userId: string
  title: string
  viewport: { x: number; y: number; zoom: number }
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  createdAt?: string
  updatedAt?: string
}

// Handle-type compatibility matrix. Used by the editor to validate edges
// before they're created, and by the executor to coerce values across an edge.
const COMPAT: Record<HandleType, HandleType[]> = {
  prompt:  ['prompt', 'any'],
  image:   ['image', 'images', 'any'],   // a single image can fan into a ref array
  images:  ['images', 'any'],
  video:   ['video', 'any'],
  entity:  ['entity', 'any'],
  any:     ['prompt', 'image', 'images', 'video', 'entity', 'any'],
}

export function handlesCompatible(from: HandleType, to: HandleType): boolean {
  return COMPAT[from]?.includes(to) ?? false
}

// Definition of each node type's handles. The editor reads this to render
// dots; the executor reads it to know what to fetch from upstream.
export interface NodeTypeDef {
  type: NodeType
  label: string
  category: 'input' | 'image' | 'video' | 'utility' | 'output'
  inputs: HandleDef[]
  outputs: HandleDef[]
  // For model nodes, which studio_models category matches
  modelCategory?: 'image' | 'video'
}

export const NODE_TYPES: Record<NodeType, NodeTypeDef> = {
  'text-prompt': {
    type: 'text-prompt',
    label: 'Prompt',
    category: 'input',
    inputs: [{ id: 'in:vars', label: 'Vars', type: 'any', multi: true }],
    outputs: [{ id: 'out:prompt', label: 'Prompt', type: 'prompt' }],
  },
  'reference-image': {
    type: 'reference-image',
    label: 'Reference',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'out:image', label: 'Image', type: 'image' }],
  },
  entity: {
    type: 'entity',
    label: 'Entity',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'out:entity', label: 'Entity', type: 'entity' },
      { id: 'out:image', label: 'Image', type: 'image' },
      { id: 'out:prompt', label: 'Description', type: 'prompt' },
    ],
  },
  skill: {
    type: 'skill',
    label: 'Skill',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'out:prompt', label: 'Template', type: 'prompt' }],
  },
  'image-gen': {
    type: 'image-gen',
    label: 'Image Model',
    category: 'image',
    modelCategory: 'image',
    inputs: [
      { id: 'in:prompt', label: 'Prompt', type: 'prompt' },
      { id: 'in:ref', label: 'References', type: 'images', multi: true },
    ],
    // Two outputs so downstream nodes can pick the shape they expect:
    //   out:image  → outputUrls[0] as a single string (for in:start, in:prompt,
    //                or as one frame into in:ref). Matches type `image`.
    //   out:images → the full outputUrls array (for sequential multi-image
    //                models like Seedream 4.5 driving multiple downstream
    //                refs). Matches type `images`.
    // For single-output models out:images is just [outputUrls[0]], so wiring
    // either is always safe.
    outputs: [
      { id: 'out:image', label: 'Image', type: 'image' },
      { id: 'out:images', label: 'All Images', type: 'images' },
    ],
  },
  'video-gen': {
    type: 'video-gen',
    label: 'Video Model',
    category: 'video',
    modelCategory: 'video',
    inputs: [
      { id: 'in:prompt', label: 'Prompt', type: 'prompt' },
      { id: 'in:start', label: 'Start frame', type: 'image' },
      { id: 'in:ref', label: 'References', type: 'images', multi: true },
      { id: 'in:end', label: 'End frame', type: 'image' },
    ],
    outputs: [{ id: 'out:video', label: 'Video', type: 'video' }],
  },
  'fan-out': {
    type: 'fan-out',
    label: 'Fan-out',
    category: 'utility',
    inputs: [{ id: 'in:source', label: 'Source', type: 'any' }],
    // `any` so the same fan-out node can carry image variations OR video
    // variations from an upstream image-gen / video-gen. Downstream handle
    // types constrain compatibility: image-gen `in:ref` is `images` and
    // video-gen `in:start`/`in:end` is `image` — both accept `any` per the
    // compatibility matrix. Editor validation passes through unchanged.
    outputs: [{ id: 'out:items', label: 'Variations', type: 'any' }],
  },
  output: {
    type: 'output',
    label: 'Output',
    category: 'output',
    inputs: [{ id: 'in:asset', label: 'Asset', type: 'any', multi: true }],
    outputs: [],
  },
  orchestrator: {
    type: 'orchestrator',
    label: 'Creative Director',
    category: 'utility',
    inputs: [{ id: 'in:context', label: 'Context', type: 'any', multi: true }],
    outputs: [{ id: 'out:prompt', label: 'Prompt', type: 'prompt' }],
  },
  // Production Brief — distills a storyboard (multi-image refs) + a high-level
  // concept text into a long-form brief AND a 2500-char Seedance-shaped
  // distilled prompt with [Image1]…[ImageN] tokens. The downstream Seedance
  // node consumes `out:prompt` on its `in:prompt` AND should auto-pick up the
  // SAME ref images on its `in:ref` so the [Image1] tokens resolve.
  'production-brief': {
    type: 'production-brief',
    label: 'Production Brief',
    category: 'utility',
    inputs: [
      { id: 'in:storyboard', label: 'Storyboard', type: 'images', multi: true },
      { id: 'in:concept', label: 'Concept', type: 'prompt' },
    ],
    outputs: [
      { id: 'out:brief', label: 'Brief', type: 'prompt' },
      { id: 'out:prompt', label: 'Prompt', type: 'prompt' },
    ],
  },
}

export function newNode(
  type: NodeType,
  position: { x: number; y: number },
  data?: Partial<CanvasNode['data']>,
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type,
    position,
    data: { status: 'idle', ...data },
  }
}

export function newEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): CanvasEdge {
  return {
    id: crypto.randomUUID(),
    source,
    sourceHandle,
    target,
    targetHandle,
  }
}
