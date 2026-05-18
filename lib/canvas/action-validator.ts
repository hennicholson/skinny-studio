// Canvas-action validator.
//
// Pure, server-side check + auto-fix layer that runs on the JSON the Director
// AI emits inside its ```canvas-action fenced block, BEFORE the payload is
// shipped to the client. The AI (Gemini 2.5 Flash) reliably hallucinates short
// ids that don't exist, forgets to wire the prompt edge on a brand-new model
// node, fuses incompatible handle types, and leaves stale params behind when
// it swaps a model. Caught client-side, these defects render as half-broken
// graphs that the user has to undo. Caught here — server-side, mid-stream —
// they're either auto-repaired (and we surface a `fixed` issue so the UI can
// tell the user what we did) or dropped with a structured `error` issue that
// the client can show next to the chat bubble. Cost: a few hundred lines of
// pure TS run once per turn. Reward: the canvas never goes broken.
//
// This file deliberately re-implements the handle-compatibility matrix from
// `ir.ts` rather than importing it, so the validator stays a leaf module
// with no React/runtime dependencies. The two MUST be kept in sync — see
// the comment block in COMPAT below.

import type {
  CanvasAction,
  CanvasActionPayload,
  AddNodeAction,
  ConnectAction,
  UpdateNodeAction,
} from './director-actions'
import { hasDestructiveAction } from './director-actions'
import type { NodeType, HandleType } from './ir'

export interface ValidationIssue {
  level: 'error' | 'warning' | 'fixed'
  /** 0-based index into the ORIGINAL (pre-fix) payload.actions array. */
  actionIndex: number
  code: string
  message: string
  /** Present when level === 'fixed'. Describes the auto-repair. */
  fix?: string
}

/** Compact telemetry the chat route can log to a future `director_emits`
 *  table for measuring NL→node success rate. Not consumed by the client
 *  yet, but the shape is stable. */
export interface ValidationSummary {
  actionsIn: number
  actionsOut: number
  errors: number
  warnings: number
  fixed: number
  autoWiredPrompts: number
  autoWiredRefs: number
}

export interface ValidationResult {
  payload: CanvasActionPayload
  issues: ValidationIssue[]
  /** false iff at least one level==='error' remains after auto-fix. */
  ok: boolean
  /** Forward-looking telemetry; safe to ignore on the client. */
  summary: ValidationSummary
}

interface CanvasSnapshot {
  nodes: Array<{ id: string; type: string; data?: any }>
  edges: Array<{
    id: string
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
  }>
}

// ---------------------------------------------------------------------------
// Handle compatibility — MUST stay in sync with `ir.ts` COMPAT + NODE_TYPES.
// We inline rather than import so this module has no client-only edges and
// can be tree-shaken into the API route without dragging React along.
// ---------------------------------------------------------------------------
const COMPAT: Record<HandleType, HandleType[]> = {
  prompt: ['prompt', 'any'],
  image: ['image', 'images', 'any'],
  images: ['images', 'any'],
  video: ['video', 'any'],
  entity: ['entity', 'any'],
  any: ['prompt', 'image', 'images', 'video', 'entity', 'any'],
}

function handlesCompatible(from: HandleType, to: HandleType): boolean {
  return COMPAT[from]?.includes(to) ?? false
}

// Subset of NODE_TYPES we need: handle id → handle type, per node type.
// Mirrors `ir.ts` NODE_TYPES exactly.
const NODE_HANDLES: Record<
  NodeType,
  { inputs: Record<string, HandleType>; outputs: Record<string, HandleType> }
> = {
  'text-prompt': {
    inputs: { 'in:vars': 'any' },
    outputs: { 'out:prompt': 'prompt' },
  },
  'reference-image': {
    inputs: {},
    outputs: { 'out:image': 'image' },
  },
  entity: {
    inputs: {},
    outputs: {
      'out:entity': 'entity',
      'out:image': 'image',
      'out:prompt': 'prompt',
    },
  },
  skill: {
    inputs: {},
    outputs: { 'out:prompt': 'prompt' },
  },
  'image-gen': {
    inputs: { 'in:prompt': 'prompt', 'in:ref': 'images' },
    outputs: { 'out:image': 'image' },
  },
  'video-gen': {
    inputs: {
      'in:prompt': 'prompt',
      'in:start': 'image',
      'in:ref': 'images',
      'in:end': 'image',
    },
    outputs: { 'out:video': 'video' },
  },
  'fan-out': {
    inputs: { 'in:source': 'any' },
    outputs: { 'out:items': 'images' },
  },
  output: {
    inputs: { 'in:asset': 'any' },
    outputs: {},
  },
  orchestrator: {
    inputs: { 'in:context': 'any' },
    outputs: { 'out:prompt': 'prompt' },
  },
  'production-brief': {
    inputs: { 'in:storyboard': 'images', 'in:concept': 'prompt' },
    outputs: { 'out:brief': 'prompt', 'out:prompt': 'prompt' },
  },
}

// Placeholder strings the AI emits when it doesn't actually know an id. We
// detect these literally so we can emit a helpful error instead of trying to
// prefix-match against the canvas (which produces gibberish suggestions).
const PLACEHOLDER_IDS = new Set([
  'unknown',
  'undefined',
  'null',
  '',
  'tmp',
  'tbd',
  'node',
  'existing-prompt',
  'the-prompt',
  'prompt',
  'new-model',
  'this-node',
])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function validateAndFix(
  payload: CanvasActionPayload,
  canvas: CanvasSnapshot | null,
): ValidationResult {
  const issues: ValidationIssue[] = []
  const actionsIn = payload.actions.length

  // Defensive copy — never mutate the caller's payload.
  const actions: CanvasAction[] = payload.actions.map((a) => ({ ...a })) as CanvasAction[]

  // tmpIdMap projects "what will exist after we apply prior actions" so a
  // later connect can be validated against a node added earlier in the block.
  // Maps tmp-id → projected node type.
  const tmpTypes = new Map<string, NodeType>()
  // Maps tmp-id → projected node data (so we can read modelSlug etc later).
  const tmpData = new Map<string, any>()

  // Track which actions we're going to drop. We don't splice in-place because
  // issue indices must reference the ORIGINAL payload.actions positions.
  const dropped = new Set<number>()

  // ---- Pass 0: structural shape gate ----
  // Drop malformed actions BEFORE any deeper analysis, so downstream passes
  // don't waste cycles or emit confusing chained errors.
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    if (!action || typeof action !== 'object' || !('type' in action)) {
      issues.push({
        level: 'error',
        actionIndex: i,
        code: 'malformed_action',
        message: `action at index ${i} is missing a "type" field`,
      })
      dropped.add(i)
      continue
    }
    switch (action.type) {
      case 'add_node':
        if (!action.id || typeof action.id !== 'string') {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'malformed_action',
            message: `add_node at index ${i} is missing required field "id"`,
          })
          dropped.add(i)
        } else if (!action.nodeType || typeof action.nodeType !== 'string') {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'malformed_action',
            message: `add_node ${action.id} is missing required field "nodeType"`,
          })
          dropped.add(i)
        }
        break
      case 'update_node':
      case 'move_node':
      case 'delete_node':
      case 'delete_edge':
        if (!(action as any).id || typeof (action as any).id !== 'string') {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'malformed_action',
            message: `${action.type} at index ${i} is missing required field "id"`,
          })
          dropped.add(i)
        }
        break
      case 'connect': {
        const c = action as ConnectAction
        if (!c.source || typeof c.source !== 'string') {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'malformed_action',
            message: `connect at index ${i} is missing required field "source"`,
          })
          dropped.add(i)
        } else if (!c.target || typeof c.target !== 'string') {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'malformed_action',
            message: `connect at index ${i} is missing required field "target"`,
          })
          dropped.add(i)
        } else if (!c.sourceHandle || !c.targetHandle) {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'malformed_action',
            message: `connect ${c.source}→${c.target} is missing sourceHandle/targetHandle`,
          })
          dropped.add(i)
        }
        break
      }
      case 'select':
        if (!Array.isArray((action as any).ids)) {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'malformed_action',
            message: `select at index ${i} is missing required field "ids" (array)`,
          })
          dropped.add(i)
        }
        break
      case 'clear_canvas':
        break
      case 'auto_layout':
        // Structurally trivial — direction/columnGap/rowGap/fitAfter are all
        // optional. We sanity-check the enum just to catch typos.
        {
          const dir = (action as any).direction
          if (dir !== undefined && dir !== 'LR' && dir !== 'TB') {
            issues.push({
              level: 'warning',
              actionIndex: i,
              code: 'malformed_action',
              message: `auto_layout direction "${dir}" is not "LR" or "TB" — defaulting to "LR"`,
            })
          }
        }
        break
      default:
        issues.push({
          level: 'error',
          actionIndex: i,
          code: 'malformed_action',
          message: `unknown action type "${(action as any).type}" at index ${i}`,
        })
        dropped.add(i)
    }
  }

  // ---- Pass 1: resolve ids, validate handle compat, drop unresolvable ----
  for (let i = 0; i < actions.length; i++) {
    if (dropped.has(i)) continue
    const action = actions[i]
    if (!action) continue

    switch (action.type) {
      case 'add_node': {
        if (!NODE_HANDLES[action.nodeType]) {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'unknown_node_type',
            message: `add_node ${action.id}: unknown nodeType "${action.nodeType}"`,
          })
          dropped.add(i)
          break
        }
        tmpTypes.set(action.id, action.nodeType)
        tmpData.set(action.id, action.data || {})
        break
      }

      case 'connect': {
        // Detect placeholder string sources/targets BEFORE id resolution so we
        // emit a helpful message instead of a misleading "did you mean".
        const srcPlaceholder = isPlaceholderId(action.source)
        const tgtPlaceholder = isPlaceholderId(action.target)
        if (srcPlaceholder) {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'placeholder_id',
            message: `connect source "${action.source}" is a placeholder — emit either a tmp-* id you created in this batch or a real 4-char short id from the canvas description.`,
          })
          dropped.add(i)
          break
        }
        if (tgtPlaceholder) {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'placeholder_id',
            message: `connect target "${action.target}" is a placeholder — emit either a tmp-* id you created in this batch or a real 4-char short id from the canvas description.`,
          })
          dropped.add(i)
          break
        }

        const src = resolveId(action.source, tmpTypes, canvas)
        const tgt = resolveId(action.target, tmpTypes, canvas)
        if (!src) {
          const hint = suggestionSuffix(action.source, tmpTypes, canvas)
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'unknown_node',
            message: `connect source "${action.source}" → ${action.target}: unknown source node (not on canvas and not a tmp-id in this batch).${hint}`,
          })
          dropped.add(i)
          break
        }
        if (!tgt) {
          const hint = suggestionSuffix(action.target, tmpTypes, canvas)
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'unknown_node',
            message: `connect target "${action.target}" ← ${action.source}: unknown target node (not on canvas and not a tmp-id in this batch).${hint}`,
          })
          dropped.add(i)
          break
        }
        // Rewrite to the resolved ids so the client doesn't have to redo this.
        action.source = src.id
        action.target = tgt.id

        // Validate handle compatibility.
        const srcDef = NODE_HANDLES[src.type as NodeType]
        const tgtDef = NODE_HANDLES[tgt.type as NodeType]
        const srcHT = srcDef?.outputs[action.sourceHandle]
        const tgtHT = tgtDef?.inputs[action.targetHandle]
        if (!srcHT) {
          const known = srcDef ? Object.keys(srcDef.outputs).join(', ') || '(none)' : '?'
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'unknown_handle',
            message: `connect [${shortId(src.id)}] ${src.type} has no output handle "${action.sourceHandle}". Available: ${known}.`,
          })
          dropped.add(i)
          break
        }
        if (!tgtHT) {
          const known = tgtDef ? Object.keys(tgtDef.inputs).join(', ') || '(none)' : '?'
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'unknown_handle',
            message: `connect [${shortId(tgt.id)}] ${tgt.type} has no input handle "${action.targetHandle}". Available: ${known}.`,
          })
          dropped.add(i)
          break
        }
        if (!handlesCompatible(srcHT, tgtHT)) {
          const hint = handleHint(action.targetHandle, srcHT)
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'incompatible_handles',
            message: `connect [${shortId(src.id)}] ${action.sourceHandle} → [${shortId(tgt.id)}] ${action.targetHandle}: type mismatch (${srcHT} → ${tgtHT}).${hint}`,
          })
          dropped.add(i)
          break
        }
        break
      }

      case 'update_node':
      case 'move_node':
      case 'delete_node': {
        if (isPlaceholderId(action.id)) {
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'placeholder_id',
            message: `${action.type} id "${action.id}" is a placeholder — emit a tmp-* id or a real short id.`,
          })
          dropped.add(i)
          break
        }
        const resolved = resolveId(action.id, tmpTypes, canvas)
        if (!resolved) {
          const hint = suggestionSuffix(action.id, tmpTypes, canvas)
          issues.push({
            level: 'error',
            actionIndex: i,
            code: 'unknown_node',
            message: `${action.type} "${action.id}": unknown node (not on canvas and not a tmp-id in this batch).${hint}`,
          })
          dropped.add(i)
          break
        }
        action.id = resolved.id
        break
      }

      case 'select': {
        // For select, drop unresolved ids but keep the action if any remain.
        const before = action.ids.length
        action.ids = action.ids
          .map((id) => resolveId(id, tmpTypes, canvas)?.id)
          .filter((id): id is string => Boolean(id))
        if (action.ids.length < before) {
          issues.push({
            level: 'warning',
            actionIndex: i,
            code: 'unknown_node',
            message: `select: ${before - action.ids.length} unresolved id(s) dropped`,
          })
        }
        if (action.ids.length === 0) dropped.add(i)
        break
      }

      case 'delete_edge':
      case 'clear_canvas':
        // No id-resolution against the node map needed here.
        break
    }
  }

  // ---- Pass 2: auto-fix - wrong handle for video starting frame ----
  // Only operate on actions that survived Pass 1.
  for (let i = 0; i < actions.length; i++) {
    if (dropped.has(i)) continue
    const action = actions[i]
    if (!action || action.type !== 'connect') continue

    const tgt = resolveId(action.target, tmpTypes, canvas)
    if (!tgt || tgt.type !== 'video-gen') continue
    if (action.targetHandle !== 'in:ref') continue

    const src = resolveId(action.source, tmpTypes, canvas)
    if (!src) continue
    const srcDef = NODE_HANDLES[src.type as NodeType]
    const srcHT = srcDef?.outputs[action.sourceHandle]
    if (srcHT !== 'image') continue

    // Look for "start"/"first frame"/"from this" signal in the source node's
    // title or visionContext.
    const srcData = tmpData.get(action.source) || src.data || {}
    const haystack = [
      srcData.title,
      srcData.visionContext,
      srcData.prompt,
    ]
      .filter((v) => typeof v === 'string')
      .join(' ')
      .toLowerCase()
    const startSignal =
      /\b(start(ing)?\s+frame|first\s+frame|from\s+this|begin(ning)?\s+with)\b/.test(
        haystack,
      )
    if (!startSignal) continue

    const prev = action.targetHandle
    action.targetHandle = 'in:start'
    issues.push({
      level: 'fixed',
      actionIndex: i,
      code: 'video_start_handle',
      message: `Connection targeted ${prev} on video-gen but source reads as a start frame`,
      fix: `Rewrote target handle ${prev} → in:start on connect ${action.source}→${action.target}`,
    })
  }

  // ---- Pass 3: auto-fix - stale params on model swap ----
  for (let i = 0; i < actions.length; i++) {
    if (dropped.has(i)) continue
    const action = actions[i]
    if (!action || action.type !== 'update_node') continue

    const upd = action as UpdateNodeAction
    const patch: any = upd.patch || {}
    if (!patch || typeof patch !== 'object') continue
    if (!('modelSlug' in patch)) continue

    // Find the existing node to see whether the modelSlug actually changes.
    const resolved = resolveId(upd.id, tmpTypes, canvas)
    const existing = resolved?.data || {}
    const oldSlug = existing.modelSlug
    const newSlug = patch.modelSlug
    if (!oldSlug || oldSlug === newSlug) continue

    // If the AI didn't include params in the patch, OR included non-empty
    // params, normalise to an empty object — old model's params won't fit
    // the new model.
    const hadParamsKey = Object.prototype.hasOwnProperty.call(patch, 'params')
    if (!hadParamsKey || (patch.params && Object.keys(patch.params).length > 0)) {
      patch.params = {}
      ;(action as UpdateNodeAction).patch = patch
      issues.push({
        level: 'fixed',
        actionIndex: i,
        code: 'stale_params_reset',
        message: `Model swap on ${upd.id} kept stale params`,
        fix: `Reset params to {} on model swap ${oldSlug} → ${newSlug}`,
      })
    }
  }

  // ---- Pass 4: auto-fix - Seedream sequential param normalisation ----
  for (let i = 0; i < actions.length; i++) {
    if (dropped.has(i)) continue
    const action = actions[i]
    if (!action || action.type !== 'add_node') continue
    if (action.nodeType !== 'image-gen') continue
    const slug: string | undefined = action.data?.modelSlug
    if (!slug || !slug.startsWith('seedream')) continue

    const params = { ...(action.data?.params || {}) }
    const hasSeq = params.sequential_image_generation !== undefined
    const hasMax = typeof params.max_images === 'number'
    let changed = false
    let fixMsg = ''

    if (hasMax && !hasSeq && params.max_images > 1) {
      params.sequential_image_generation = 'auto'
      changed = true
      fixMsg = `max_images=${params.max_images} requires sequential_image_generation='auto'`
    } else if (
      hasSeq &&
      params.sequential_image_generation === 'auto' &&
      !hasMax
    ) {
      params.max_images = 4
      changed = true
      fixMsg = `sequential_image_generation='auto' requires max_images — defaulted to 4`
    }

    if (changed) {
      action.data = { ...(action.data || {}), params }
      tmpData.set(action.id, action.data)
      issues.push({
        level: 'fixed',
        actionIndex: i,
        code: 'seedream_params_normalized',
        message: `Seedream sequential params were incomplete`,
        fix: fixMsg,
      })
    }
  }

  // ---- Pass 5: auto-wire missing in:prompt / in:ref edges ----
  // Strategies, applied in order per-orphan:
  //   A. Updated-prompt pattern: same batch contains an update_node against a
  //      text-prompt with a `prompt` patch.
  //   B. Just-added prompt: same batch added a text-prompt with no outgoing
  //      out:prompt edge.
  //   C. Lone existing prompt on canvas without an outgoing prompt edge.
  //   D. Most-recent existing prompt (last in canvas.nodes).
  //   E. None — fall through, will earn an orphan_model warning in Pass 6.
  // Mirror logic applies to in:ref when an update_node touched a
  // reference-image or entity with a non-empty imageUrl.

  // Pre-compute "in this batch": prompts being added, prompts being updated.
  const batchAddedPrompts: { idx: number; id: string }[] = []
  const batchAddedRefs: { idx: number; id: string; nodeType: 'reference-image' | 'entity' }[] = []
  const batchUpdatedPromptIds: string[] = []
  const batchUpdatedRefIds: string[] = []
  for (let j = 0; j < actions.length; j++) {
    if (dropped.has(j)) continue
    const a = actions[j]
    if (!a) continue
    if (a.type === 'add_node' && a.nodeType === 'text-prompt') {
      batchAddedPrompts.push({ idx: j, id: a.id })
    }
    if (
      a.type === 'add_node' &&
      (a.nodeType === 'reference-image' || a.nodeType === 'entity')
    ) {
      batchAddedRefs.push({ idx: j, id: a.id, nodeType: a.nodeType })
    }
    if (a.type === 'update_node') {
      const upd = a as UpdateNodeAction
      const resolved = resolveId(upd.id, tmpTypes, canvas)
      const nodeType = resolved?.type
      const patch: any = upd.patch || {}
      if (
        nodeType === 'text-prompt' &&
        typeof patch.prompt === 'string' &&
        patch.prompt.length > 0
      ) {
        batchUpdatedPromptIds.push(resolved!.id)
      }
      if (
        (nodeType === 'reference-image' || nodeType === 'entity')
      ) {
        // Prefer the updated imageUrl if present; otherwise fall back to the
        // resolved node's existing data (user might just be marking it as
        // the active ref via a non-imageUrl patch).
        const incoming = patch.imageUrl ?? resolved?.data?.imageUrl
        if (typeof incoming === 'string' && incoming.length > 0) {
          batchUpdatedRefIds.push(resolved!.id)
        }
      }
    }
  }

  function alreadyOutgoingPrompt(srcId: string): boolean {
    return actions.some(
      (b, bi) =>
        !dropped.has(bi) &&
        b &&
        b.type === 'connect' &&
        b.source === srcId &&
        b.sourceHandle === 'out:prompt',
    )
  }
  function alreadyOutgoingImage(srcId: string): boolean {
    return actions.some(
      (b, bi) =>
        !dropped.has(bi) &&
        b &&
        b.type === 'connect' &&
        b.source === srcId &&
        (b.sourceHandle === 'out:image' || b.sourceHandle === 'out:images'),
    )
  }
  function hasIncomingOn(targetTmpId: string, handle: string): boolean {
    for (let k = 0; k < actions.length; k++) {
      if (dropped.has(k)) continue
      const a = actions[k]
      if (!a || a.type !== 'connect') continue
      if (a.target !== targetTmpId) continue
      if (a.targetHandle === handle) return true
    }
    if (canvas) {
      const realId = resolveId(targetTmpId, tmpTypes, canvas)?.id
      if (realId) {
        for (const e of canvas.edges) {
          if (e.target === realId && e.targetHandle === handle) return true
        }
      }
    }
    return false
  }

  const newActions: CanvasAction[] = []
  let autoWiredPrompts = 0
  let autoWiredRefs = 0
  // Track which orphan-model add_node ids got an auto-wired in:prompt or
  // in:ref this pass. Used after the loop to demote any error-level issues
  // on connects that were TRYING to hit that target — auto-wire filled the
  // gap, so we shouldn't yell at the user with red errors. They become
  // gentle "auto-corrected" warnings instead.
  const autoWiredPromptTargets = new Set<string>()
  const autoWiredRefTargets = new Set<string>()

  for (let i = 0; i < actions.length; i++) {
    if (dropped.has(i)) continue
    const action = actions[i]
    newActions.push(action)

    if (action.type !== 'add_node') continue
    if (action.nodeType !== 'image-gen' && action.nodeType !== 'video-gen') continue

    // ---- in:prompt auto-wire ----
    if (!hasIncomingOn(action.id, 'in:prompt')) {
      let promptSourceId: string | null = null
      let strategy: string | null = null

      // Strategy A — updated prompt in this batch.
      for (const updId of batchUpdatedPromptIds) {
        if (alreadyOutgoingPrompt(updId)) continue
        promptSourceId = updId
        strategy = 'auto_wired_updated_prompt'
        break
      }

      // Strategy B — just-added prompt in this batch.
      if (!promptSourceId) {
        for (const added of batchAddedPrompts) {
          if (alreadyOutgoingPrompt(added.id)) continue
          promptSourceId = added.id
          strategy = 'auto_wired_new_prompt'
          break
        }
      }

      // Strategy C / D — existing canvas prompts.
      if (!promptSourceId && canvas) {
        const existingPrompts = canvas.nodes.filter((n) => n.type === 'text-prompt')
        const unwiredExisting = existingPrompts.filter(
          (c) =>
            !canvas.edges.some(
              (e) => e.source === c.id && e.sourceHandle === 'out:prompt',
            ) && !alreadyOutgoingPrompt(c.id),
        )
        if (existingPrompts.length === 1) {
          // C — Lone existing prompt (whether wired or not, prefer connecting
          // to the one that exists; if already wired elsewhere we still wire
          // to the new model — a single prompt can feed many models).
          const sole = existingPrompts[0]
          // But ONLY auto-wire if we aren't already feeding this exact target
          // (we already checked hasIncomingOn above, so good).
          promptSourceId = sole.id
          strategy = 'auto_wired_existing_prompt'
        } else if (unwiredExisting.length >= 1) {
          // Prefer an unwired one.
          promptSourceId = unwiredExisting[unwiredExisting.length - 1].id
          strategy = 'auto_wired_existing_prompt'
        } else if (existingPrompts.length > 1) {
          // D — Most-recent (last in nodes array — canvas is creation-ordered).
          promptSourceId = existingPrompts[existingPrompts.length - 1].id
          strategy = 'auto_wired_existing_prompt'
        }
      }

      if (promptSourceId && strategy) {
        const autoConnect: ConnectAction = {
          type: 'connect',
          source: promptSourceId,
          sourceHandle: 'out:prompt',
          target: action.id,
          targetHandle: 'in:prompt',
        }
        newActions.push(autoConnect)
        autoWiredPrompts++
        autoWiredPromptTargets.add(action.id)
        issues.push({
          level: 'fixed',
          actionIndex: i,
          code: strategy,
          message: `${action.nodeType} ${action.id} had no prompt edge`,
          fix: `Connected [${shortId(promptSourceId)}] out:prompt → [${shortId(action.id)}] in:prompt (${strategyLabel(strategy)})`,
        })
      }
    }

    // ---- in:ref auto-wire ----
    // Two strategies run in priority order. Both produce a single
    // `auto_wired_*_ref` issue per orphan, and both stop after the first
    // successful wire (one ref per orphan).
    if (!hasIncomingOn(action.id, 'in:ref')) {
      let refSourceId: string | null = null
      let refStrategy: 'auto_wired_updated_ref' | 'auto_wired_new_ref' | null = null

      // Strategy A2 — user UPDATED an existing reference-image/entity in
      // this batch (imageUrl non-empty). High intent signal.
      for (const refId of batchUpdatedRefIds) {
        if (alreadyOutgoingImage(refId)) continue
        refSourceId = refId
        refStrategy = 'auto_wired_updated_ref'
        break
      }

      // Strategy F — user ADDED a fresh reference-image/entity in this
      // batch. Wire it even if the imageUrl is blank — the user said "make
      // all nodes blank and connected", we honor the topology even when
      // node data is empty. They'll fill in the URL after.
      if (!refSourceId) {
        for (const added of batchAddedRefs) {
          if (alreadyOutgoingImage(added.id)) continue
          refSourceId = added.id
          refStrategy = 'auto_wired_new_ref'
          break
        }
      }

      if (refSourceId && refStrategy) {
        const autoConnect: ConnectAction = {
          type: 'connect',
          source: refSourceId,
          sourceHandle: 'out:image',
          target: action.id,
          targetHandle: 'in:ref',
        }
        newActions.push(autoConnect)
        autoWiredRefs++
        autoWiredRefTargets.add(action.id)
        const reason =
          refStrategy === 'auto_wired_updated_ref'
            ? `user updated [${shortId(refSourceId)}]`
            : `${refStrategy === 'auto_wired_new_ref' ? 'new ref added in same batch' : 'ref present'}`
        issues.push({
          level: 'fixed',
          actionIndex: i,
          code: refStrategy,
          message: `${action.nodeType} ${action.id} had no reference edge (${reason})`,
          fix: `Connected [${shortId(refSourceId)}] out:image → [${shortId(action.id)}] in:ref`,
        })
      }
    }
  }

  // ---- Pass 5.5: demote errors on connects whose orphan was auto-wired ----
  // If the AI emitted bogus connects (placeholder/hallucinated UUID source)
  // targeting a model node, and Pass 5 successfully auto-wired that model's
  // in:prompt or in:ref anyway, we shouldn't surface red errors to the user
  // — the gap was filled. Demote those errors to warnings tagged "auto-
  // corrected", which the chat renders in amber instead of rose.
  if (autoWiredPromptTargets.size + autoWiredRefTargets.size > 0) {
    for (const iss of issues) {
      if (iss.level !== 'error') continue
      if (
        iss.code !== 'placeholder_id' &&
        iss.code !== 'unknown_node' &&
        iss.code !== 'incompatible_handles'
      ) {
        continue
      }
      const orig = payload.actions[iss.actionIndex]
      if (!orig || orig.type !== 'connect') continue
      const handle = (orig as ConnectAction).targetHandle
      const target = (orig as ConnectAction).target
      // Match: bogus connect targeted a model id that we successfully
      // auto-wired on the same handle.
      const filled =
        (handle === 'in:prompt' && autoWiredPromptTargets.has(target)) ||
        (handle === 'in:ref' && autoWiredRefTargets.has(target))
      if (filled) {
        iss.level = 'warning'
        iss.message = `Auto-corrected — ${iss.message}`
      }
    }
  }

  // ---- Pass 6: warning - orphan model node ----
  // After auto-fixes, any add_node image-gen/video-gen without an incoming
  // in:prompt edge in the FINAL action list earns a warning.
  for (let i = 0; i < newActions.length; i++) {
    const action = newActions[i]
    if (!action || action.type !== 'add_node') continue
    if (action.nodeType !== 'image-gen' && action.nodeType !== 'video-gen') continue
    const hasPrompt = newActions.some(
      (b) =>
        b &&
        b.type === 'connect' &&
        b.target === action.id &&
        b.targetHandle === 'in:prompt',
    )
    if (hasPrompt) continue
    // Also accept an existing canvas in-edge (rare, defensive).
    if (canvas) {
      const realId = resolveId(action.id, tmpTypes, canvas)?.id
      if (
        realId &&
        canvas.edges.some(
          (e) => e.target === realId && e.targetHandle === 'in:prompt',
        )
      ) {
        continue
      }
    }
    // Find the original index in payload.actions for the issue.
    const origIdx = payload.actions.findIndex(
      (a) => a.type === 'add_node' && (a as AddNodeAction).id === action.id,
    )
    issues.push({
      level: 'warning',
      actionIndex: origIdx >= 0 ? origIdx : 0,
      code: 'orphan_model',
      message: `${action.nodeType} ${action.id} has no prompt input — user may need to wire it`,
    })
  }

  // ---- Pass 7: warning - destructive without explanation ----
  if (
    hasDestructiveAction(payload) &&
    (!payload.explanation || payload.explanation.trim().length === 0)
  ) {
    issues.push({
      level: 'warning',
      actionIndex: 0,
      code: 'missing_explanation',
      message:
        'Payload contains destructive actions but has no explanation field',
    })
  }

  const fixed: CanvasActionPayload = {
    ...payload,
    actions: newActions,
  }

  const hasError = issues.some((iss) => iss.level === 'error')
  const summary: ValidationSummary = {
    actionsIn,
    actionsOut: newActions.length,
    errors: issues.filter((iss) => iss.level === 'error').length,
    warnings: issues.filter((iss) => iss.level === 'warning').length,
    fixed: issues.filter((iss) => iss.level === 'fixed').length,
    autoWiredPrompts,
    autoWiredRefs,
  }
  return { payload: fixed, issues, ok: !hasError, summary }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ResolvedNode {
  id: string
  type: string
  data?: any
}

/**
 * Mirror of CanvasShell's `resolveExistingId`:
 *   1. tmp-id projection from earlier add_node actions
 *   2. exact match in canvas
 *   3. prefix match on first 4 hex chars
 * Returns the resolved node (id+type+data) or null.
 *
 * `canvas` may be null when the validator runs outside a request that carries
 * the IR. In that case only tmp-id resolution works; existing-canvas branches
 * silently no-op so we don't over-reject.
 */
function resolveId(
  id: string,
  tmpTypes: Map<string, NodeType>,
  canvas: CanvasSnapshot | null,
): ResolvedNode | null {
  if (!id) return null
  if (tmpTypes.has(id)) {
    return { id, type: tmpTypes.get(id) as string }
  }
  if (!canvas) {
    // No canvas in this context: anything not in tmp map is unknown — but to
    // avoid over-rejecting in offline / no-IR contexts, treat as unknown only
    // when the id looks unmistakeably like a tmp- ref. Otherwise accept blind
    // (handle-compat may still catch issues).
    if (id.startsWith('tmp-')) return null
    return { id, type: 'unknown' }
  }
  const exact = canvas.nodes.find((n) => n.id === id)
  if (exact) return exact
  if (id.startsWith('tmp-')) return null
  const headLen = Math.min(4, id.length)
  const head = id.slice(0, headLen).toLowerCase()
  const matches = canvas.nodes.filter((n) => n.id.toLowerCase().startsWith(head))
  if (matches.length === 1) return matches[0]
  return null
}

function isPlaceholderId(id: unknown): boolean {
  if (typeof id !== 'string') return false
  return PLACEHOLDER_IDS.has(id.toLowerCase().trim())
}

function shortId(id: string): string {
  return id.slice(0, 4)
}

/** Pick a friendly hint about the right input handle when the AI used the
 *  wrong one. Small, deterministic — not a model call. */
function handleHint(targetHandle: string, srcType: HandleType): string {
  if (srcType === 'prompt' && targetHandle !== 'in:prompt') {
    return ' Use in:prompt for prompt sources.'
  }
  if ((srcType === 'image' || srcType === 'images') && targetHandle === 'in:prompt') {
    return ' Use in:ref (or in:start / in:end on video-gen) for image sources.'
  }
  return ''
}

/** Build a " Did you mean [xxxx]?" hint by Levenshtein-prefix matching the
 *  unresolved id against existing canvas short ids. Returns empty string if
 *  no reasonable candidate. ~15 lines, no deps. */
function suggestionSuffix(
  id: string,
  tmpTypes: Map<string, NodeType>,
  canvas: CanvasSnapshot | null,
): string {
  if (!canvas || !id) return ''
  const needle = id.toLowerCase().slice(0, 4)
  let best: { id: string; dist: number } | null = null
  for (const n of canvas.nodes) {
    const cand = n.id.toLowerCase().slice(0, 4)
    const d = levenshtein(needle, cand)
    if (!best || d < best.dist) best = { id: cand, dist: d }
  }
  // Also consider tmp ids defined in this batch.
  const tmpKeys: string[] = []
  tmpTypes.forEach((_v, k) => tmpKeys.push(k))
  for (const tmpId of tmpKeys) {
    const cand = tmpId.toLowerCase().slice(0, 8)
    const d = levenshtein(id.toLowerCase().slice(0, 8), cand)
    if (!best || d < best.dist) best = { id: tmpId, dist: d }
  }
  if (!best || best.dist > 2) return ''
  return ` Did you mean [${best.id}]?`
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function strategyLabel(code: string): string {
  switch (code) {
    case 'auto_wired_updated_prompt':
      return 'matched the prompt you just edited'
    case 'auto_wired_new_prompt':
      return 'matched the prompt added in this turn'
    case 'auto_wired_existing_prompt':
      return 'matched an existing prompt on the canvas'
    case 'auto_wired_updated_ref':
      return 'matched the reference you just edited'
    case 'auto_wired_new_ref':
      return 'matched the reference added in this turn'
    default:
      return 'auto-wired'
  }
}
