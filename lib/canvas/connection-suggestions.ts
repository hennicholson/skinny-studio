// Suggestion engine for "drag-from-handle → drop-on-pane → pick a node".
//
// Given the HandleType of the SOURCE handle (the one the user dragged from),
// returns the set of NodeTypes that could legally accept the connection,
// and — for model-backed node types — the concrete model rows to surface in
// the picker. Pure: no React, no DOM, no canvas state.

import {
  HandleType,
  NODE_TYPES,
  NodeType,
  handlesCompatible,
} from './ir'
import type { StudioModelLite } from '@/components/canvas/types'

// ----- Core: which node *types* can accept a given source handle? --------

/**
 * Returns every NodeType whose input handle set contains at least one handle
 * whose type is compatible with the dragged source handle.
 *
 * Order matches the natural definition order of NODE_TYPES so the picker's
 * default sort is stable.
 */
export function suggestedNodeTypesForSource(
  sourceHandleType: HandleType,
): NodeType[] {
  const out: NodeType[] = []
  for (const key of Object.keys(NODE_TYPES) as NodeType[]) {
    const def = NODE_TYPES[key]
    const accepts = def.inputs.some((h) =>
      handlesCompatible(sourceHandleType, h.type),
    )
    if (accepts) out.push(key)
  }
  return out
}

// ----- Expanded: include concrete model rows for model-backed types ------

export interface SuggestedNode {
  type: NodeType
  // Set only when this suggestion is a model row (image-gen / video-gen).
  modelSlug?: string
  modelName?: string
}

/**
 * Like `suggestedNodeTypesForSource`, but for the model-backed node types
 * (`image-gen`, `video-gen`) the result is exploded into one entry per
 * matching `StudioModelLite`. Non-model node types are returned once with
 * just `{ type }`.
 *
 * The model rows are filtered by NODE_TYPES[type].modelCategory so a video
 * model only appears for a `video-gen` slot, etc.
 */
export function suggestedModelNodesForSource(
  sourceHandleType: HandleType,
  models: StudioModelLite[],
): SuggestedNode[] {
  const types = suggestedNodeTypesForSource(sourceHandleType)
  const out: SuggestedNode[] = []
  for (const type of types) {
    const def = NODE_TYPES[type]
    if (def.modelCategory) {
      // Explode into per-model rows so the user picks both the node *and*
      // its model in one step.
      for (const m of models) {
        if (m.category !== def.modelCategory) continue
        out.push({ type, modelSlug: m.slug, modelName: m.name })
      }
    } else {
      out.push({ type })
    }
  }
  return out
}

// ----- Helpers exposed for the controller / orchestrator ----------------

/**
 * Pulls the HandleType of a node-output by handle id. Returns undefined if
 * either lookup fails — callers should bail in that case (it means the
 * underlying node was deleted between connect-start and connect-end).
 */
export function resolveSourceHandleType(
  nodeType: NodeType | undefined,
  handleId: string | null | undefined,
): HandleType | undefined {
  if (!nodeType || !handleId) return undefined
  const def = NODE_TYPES[nodeType]
  if (!def) return undefined
  return def.outputs.find((h) => h.id === handleId)?.type
}

/**
 * For an already-chosen target NodeType, return the FIRST input handle id
 * compatible with the dragged source handle. The auto-wire step uses this
 * to know which `targetHandle` to attach the new edge to.
 *
 * Returns undefined if no compatible handle exists (shouldn't happen if the
 * picker was correctly filtered, but guard anyway).
 */
export function firstCompatibleInputHandle(
  targetType: NodeType,
  sourceHandleType: HandleType,
): string | undefined {
  const def = NODE_TYPES[targetType]
  if (!def) return undefined
  return def.inputs.find((h) => handlesCompatible(sourceHandleType, h.type))?.id
}
