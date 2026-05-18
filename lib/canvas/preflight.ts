// Pre-flight validation for canvas runs.
//
// Pure-function module (no React, no DOM, no Supabase) that scans every node in
// a Canvas and decides whether the executor can actually succeed. The UI calls
// this BEFORE the cost-confirm modal so we never let a user burn credits on a
// graph that's missing a required input or has a Seedance mutex conflict.
//
// Rules implemented (see README of node types in `ir.ts` for the shape):
//   - image-gen / video-gen: require `modelSlug` and every model-spec required
//     param. Image / first-frame / ref params can be satisfied either by an
//     inline value on `node.data.params` OR an incoming edge on the right handle.
//   - Seedance: enforces the three-mode mutex (T2V / I2V / multi-ref) using
//     `MODEL_SPECS[*].inputModeGroups`. Also caps reference counts vs the
//     `maxReferenceImages` / Videos / Audios fields.
//   - production-brief: needs at least one of `in:storyboard` or `in:concept`
//     connected, and `targetModel` set.
//   - orchestrator: needs at least one connected input.
//   - fan-out: needs an upstream connection.
//   - output: needs at least one connected input.
//   - data-only inputs (text-prompt, reference-image, entity, skill): if they
//     are wired into a downstream node, their underlying data must be set.
//
// After per-node checks, an `unmet_dependency` warning is added for nodes that
// depend on a node already flagged with an error — surfaces the root cause
// without spamming cascading errors.

import { Canvas, CanvasNode, NodeType, NODE_TYPES, CanvasEdge } from './ir'
import { MODEL_SPECS, ModelSpec, ParamSpec } from '@/lib/orchestrator/model-specs'

export type IssueCode =
  | 'missing_required_input'
  | 'missing_required_param'
  | 'no_model_selected'
  | 'unmet_dependency'
  | 'over_cap'
  | 'mutex_conflict'
  | 'orphan_clip'
  | 'unconnected_output'

export interface NodeValidationIssue {
  nodeId: string
  nodeType: NodeType
  nodeTitle?: string
  level: 'error' | 'warning'
  code: IssueCode
  message: string
  paramName?: string
  handleId?: string
}

export interface PreflightResult {
  ok: boolean
  issues: NodeValidationIssue[]
  warnings: NodeValidationIssue[]
  errors: NodeValidationIssue[]
}

// === Helpers ===============================================================

function specBySlug(slug: string): ModelSpec | undefined {
  return MODEL_SPECS.find((m) => m.id === slug)
}

function titleOf(node: CanvasNode): string | undefined {
  return (
    node.data.title?.trim() ||
    node.data.modelName?.trim() ||
    NODE_TYPES[node.type]?.label ||
    undefined
  )
}

function hasInlineValue(node: CanvasNode, paramName: string): boolean {
  const v = node.data.params?.[paramName]
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'boolean') return true
  return true
}

function countArrayParam(node: CanvasNode, paramName: string): number {
  const v = node.data.params?.[paramName]
  if (Array.isArray(v)) return v.length
  if (v) return 1
  return 0
}

function incomingEdges(edges: CanvasEdge[], nodeId: string, handleId?: string): CanvasEdge[] {
  return edges.filter(
    (e) => e.target === nodeId && (!handleId || e.targetHandle === handleId),
  )
}

// Map a model-spec param name → the canvas handle that, when wired upstream,
// satisfies that param. For image-gen / video-gen we cover the common cases;
// anything not listed falls back to "must be inline".
function paramToHandle(nodeType: NodeType, paramName: string): string | undefined {
  if (paramName === 'prompt') return 'in:prompt'
  if (nodeType === 'image-gen') {
    if (paramName === 'image_input' || paramName === 'input_images' || paramName === 'reference_images') {
      return 'in:ref'
    }
  }
  if (nodeType === 'video-gen') {
    if (paramName === 'image') return 'in:start'
    if (paramName === 'last_frame_image') return 'in:end'
    if (paramName === 'reference_images') return 'in:ref'
    // reference_videos / reference_audios have no dedicated handle today — only
    // inline values via the settings UI / Director.
  }
  return undefined
}

// === Per-node validators ===================================================

function validateImageGen(
  node: CanvasNode,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  if (!node.data.modelSlug) {
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'error',
      code: 'no_model_selected',
      message: 'Pick an image model before running this node.',
    })
    return
  }
  const spec = specBySlug(node.data.modelSlug)
  if (!spec) return // unknown model — let the executor surface this; not a validation concern

  validateRequiredParams(node, spec, canvas, out)
}

function validateVideoGen(
  node: CanvasNode,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  if (!node.data.modelSlug) {
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'error',
      code: 'no_model_selected',
      message: 'Pick a video model before running this node.',
    })
    return
  }
  const spec = specBySlug(node.data.modelSlug)
  if (!spec) return

  validateRequiredParams(node, spec, canvas, out)

  // Seedance-style mutex + caps (any spec that opts into inputModeGroups).
  validateInputModeMutex(node, spec, canvas, out)
  validateReferenceCaps(node, spec, out)
}

function validateRequiredParams(
  node: CanvasNode,
  spec: ModelSpec,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  for (const p of spec.params.required) {
    if (paramSatisfied(node, p, canvas)) continue
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'error',
      code: paramFailureCode(node.type, p),
      message: paramErrorMessage(spec, p, node.type),
      paramName: p.name,
      handleId: paramToHandle(node.type, p.name),
    })
  }
}

function paramSatisfied(
  node: CanvasNode,
  param: ParamSpec,
  canvas: Canvas,
): boolean {
  // 1. Inline value on node.data.params (the settings modal writes here).
  if (hasInlineValue(node, param.name)) return true

  // 2. Special-case `prompt` — `node.data.prompt` is the text-prompt-style
  //    quick field some node settings expose. Also count it.
  if (param.name === 'prompt' && node.data.prompt && node.data.prompt.trim().length > 0) return true

  // 3. Wired upstream on the matching handle.
  const handle = paramToHandle(node.type, param.name)
  if (handle && incomingEdges(canvas.edges, node.id, handle).length > 0) return true

  return false
}

function paramFailureCode(nodeType: NodeType, p: ParamSpec): IssueCode {
  if (p.type === 'image') return 'missing_required_input'
  if (p.name === 'prompt') return 'missing_required_input'
  return 'missing_required_param'
}

function paramErrorMessage(spec: ModelSpec, p: ParamSpec, nodeType: NodeType): string {
  if (p.name === 'prompt') {
    return `${spec.name} needs a prompt — connect a prompt node to in:prompt or type one in the node's settings.`
  }
  if (p.type === 'image') {
    const handle = paramToHandle(nodeType, p.name)
    if (handle) {
      return `${spec.name} needs ${p.name} — connect an image to ${handle} or set it in the node's settings.`
    }
    return `${spec.name} requires ${p.name}. Add it in the node's settings.`
  }
  return `${spec.name} needs the ${p.name} parameter set in the node's settings.`
}

function validateInputModeMutex(
  node: CanvasNode,
  spec: ModelSpec,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  const groups = spec.inputModeGroups
  if (!groups || groups.length === 0) return

  for (const group of groups) {
    const populated = group.filter((paramName) => {
      // For mutex purposes, a param is "active" if it has any value (inline)
      // OR an edge feeding the corresponding handle. Inline is the canonical
      // case (Seedance refs come from the settings modal).
      if (hasInlineValue(node, paramName)) return true
      const handle = paramToHandle(node.type, paramName)
      if (handle && incomingEdges(canvas.edges, node.id, handle).length > 0) return true
      return false
    })
    if (populated.length >= 2) {
      out.push({
        nodeId: node.id,
        nodeType: node.type,
        nodeTitle: titleOf(node),
        level: 'error',
        code: 'mutex_conflict',
        message: `${spec.name} can't use ${populated.join(' and ')} together. Clear one — these inputs belong to different modes.`,
      })
    }
  }
}

function validateReferenceCaps(
  node: CanvasNode,
  spec: ModelSpec,
  out: NodeValidationIssue[],
): void {
  const caps: Array<[string, number | undefined, string]> = [
    ['reference_images', spec.maxReferenceImages, 'reference images'],
    ['reference_videos', spec.maxReferenceVideos, 'reference videos'],
    ['reference_audios', spec.maxReferenceAudios, 'reference audios'],
  ]
  for (const [param, cap, label] of caps) {
    if (!cap) continue
    const n = countArrayParam(node, param)
    if (n > cap) {
      out.push({
        nodeId: node.id,
        nodeType: node.type,
        nodeTitle: titleOf(node),
        level: 'error',
        code: 'over_cap',
        message: `${spec.name} accepts at most ${cap} ${label} but ${n} are wired up. Remove ${n - cap}.`,
        paramName: param,
      })
    }
  }
}

function validateProductionBrief(
  node: CanvasNode,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  const hasStoryboard = incomingEdges(canvas.edges, node.id, 'in:storyboard').length > 0
  const hasConcept = incomingEdges(canvas.edges, node.id, 'in:concept').length > 0
  const hasInlineConcept = !!(node.data.prompt && node.data.prompt.trim().length > 0)
  if (!hasStoryboard && !hasConcept && !hasInlineConcept) {
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'error',
      code: 'missing_required_input',
      message: 'Production Brief needs a storyboard (images) or a concept (prompt) connected.',
    })
  }
  if (!node.data.targetModel) {
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'error',
      code: 'missing_required_param',
      message: 'Production Brief needs a target model set so it can shape the distilled prompt.',
      paramName: 'targetModel',
    })
  }
}

function validateOrchestrator(
  node: CanvasNode,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  if (incomingEdges(canvas.edges, node.id).length === 0) {
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'error',
      code: 'missing_required_input',
      message: 'Creative Director needs at least one input connected to know what to direct.',
    })
  }
}

function validateFanOut(
  node: CanvasNode,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  if (incomingEdges(canvas.edges, node.id, 'in:source').length === 0) {
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'error',
      code: 'missing_required_input',
      message: 'Fan-out needs an upstream source connected — nothing to vary.',
      handleId: 'in:source',
    })
  }
}

function validateOutput(
  node: CanvasNode,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  if (incomingEdges(canvas.edges, node.id).length === 0) {
    out.push({
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: titleOf(node),
      level: 'warning',
      code: 'unconnected_output',
      message: 'Output node has no inputs — nothing will appear here.',
    })
  }
}

// Data-only inputs (text-prompt / reference-image / entity / skill). They only
// matter when wired downstream — an unused dangling input is fine.
function validateDataInput(
  node: CanvasNode,
  canvas: Canvas,
  out: NodeValidationIssue[],
): void {
  const usedDownstream = canvas.edges.some((e) => e.source === node.id)
  if (!usedDownstream) return

  switch (node.type) {
    case 'text-prompt':
      if (!node.data.prompt || node.data.prompt.trim().length === 0) {
        out.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeTitle: titleOf(node),
          level: 'error',
          code: 'missing_required_param',
          message: 'Prompt node is empty — type some text or disconnect it.',
          paramName: 'prompt',
        })
      }
      break
    case 'reference-image':
      if (!node.data.imageUrl) {
        out.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeTitle: titleOf(node),
          level: 'error',
          code: 'missing_required_param',
          message: 'Reference image node has no image set.',
          paramName: 'imageUrl',
        })
      }
      break
    case 'entity':
      if (!node.data.entityId) {
        out.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeTitle: titleOf(node),
          level: 'error',
          code: 'missing_required_param',
          message: 'Entity node has no entity selected.',
          paramName: 'entityId',
        })
      }
      break
    case 'skill':
      if (!node.data.skillId) {
        out.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeTitle: titleOf(node),
          level: 'error',
          code: 'missing_required_param',
          message: 'Skill node has no skill selected.',
          paramName: 'skillId',
        })
      }
      break
  }
}

// === Topological dependency check ==========================================

// Returns the set of node IDs that are (transitively) downstream of any node
// in `seedIds`. Used to flag dependents with `unmet_dependency` warnings.
function downstreamOf(canvas: Canvas, seedIds: Set<string>): Set<string> {
  const out = new Set<string>()
  const stack: string[] = Array.from(seedIds)
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const e of canvas.edges) {
      if (e.source === cur && !out.has(e.target) && !seedIds.has(e.target)) {
        out.add(e.target)
        stack.push(e.target)
      }
    }
  }
  return out
}

// === Public entry point ====================================================

export function preflightCanvas(canvas: Canvas): PreflightResult {
  const issues: NodeValidationIssue[] = []

  for (const node of canvas.nodes) {
    switch (node.type) {
      case 'image-gen':
        validateImageGen(node, canvas, issues)
        break
      case 'video-gen':
        validateVideoGen(node, canvas, issues)
        break
      case 'production-brief':
        validateProductionBrief(node, canvas, issues)
        break
      case 'orchestrator':
        validateOrchestrator(node, canvas, issues)
        break
      case 'fan-out':
        validateFanOut(node, canvas, issues)
        break
      case 'output':
        validateOutput(node, canvas, issues)
        break
      case 'text-prompt':
      case 'reference-image':
      case 'entity':
      case 'skill':
        validateDataInput(node, canvas, issues)
        break
    }
  }

  // Cascade: nodes downstream of an error-level issue are flagged as
  // `unmet_dependency` warnings (not errors — root cause is enough to block).
  const erroredIds = new Set(
    issues.filter((i) => i.level === 'error').map((i) => i.nodeId),
  )
  if (erroredIds.size > 0) {
    const dependents = downstreamOf(canvas, erroredIds)
    const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
    for (const id of Array.from(dependents)) {
      const node = byId.get(id)
      if (!node) continue
      // Don't double-flag if this node itself already has an error.
      if (issues.some((i) => i.nodeId === id && i.level === 'error')) continue
      issues.push({
        nodeId: id,
        nodeType: node.type,
        nodeTitle: titleOf(node),
        level: 'warning',
        code: 'unmet_dependency',
        message: 'Waiting on an upstream node that has issues. Fix those first.',
      })
    }
  }

  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  return {
    ok: errors.length === 0,
    issues,
    warnings,
    errors,
  }
}
