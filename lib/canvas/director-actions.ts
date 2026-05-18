// Canvas-action payload — the contract between the Director AI and the
// canvas. The model emits this as JSON inside a fenced ```canvas-action
// block; the chat route extracts and streams it as a `toolCall` SSE event;
// the CanvasShell's `applyAction()` interprets and runs each action.
//
// Design choices:
//   - One block per turn batches multiple atomic actions, so the AI can
//     create three nodes + two edges in a single utterance.
//   - Actions reference each other by `id`. The AI can use temporary
//     ids (e.g. "tmp-prompt-1") for nodes it's creating in the same
//     block — `applyAction` maps tmp ids → real UUIDs before running.
//   - `delete_*` and `clear_canvas` are gated by a confirmation card; the
//     rest apply silently with toast + undo support.

import type { NodeType, CanvasNode } from './ir'

export const CANVAS_ACTION_VERSION = 1

export interface CanvasActionPayload {
  /** Schema version. Bump when fields are added that older clients can't ignore. */
  version: number
  /** Ordered list of atomic actions. Applied sequentially. */
  actions: CanvasAction[]
  /** Short human-readable summary of what the AI did. Surfaced in the thread. */
  explanation?: string
}

export type CanvasAction =
  | AddNodeAction
  | ConnectAction
  | UpdateNodeAction
  | MoveNodeAction
  | DeleteNodeAction
  | DeleteEdgeAction
  | ClearCanvasAction
  | SelectAction
  | AutoLayoutAction

export interface AddNodeAction {
  type: 'add_node'
  /** Temp id used within this block to reference the new node in subsequent
      `connect` actions. Mapped to a real UUID at apply time. */
  id: string
  nodeType: NodeType
  position?: { x: number; y: number }
  data?: Partial<CanvasNode['data']>
}

export interface ConnectAction {
  type: 'connect'
  /** Source node id — may be a real id from the existing canvas or a tmp id
      from an earlier `add_node` in this same block. */
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface UpdateNodeAction {
  type: 'update_node'
  id: string
  patch: Partial<CanvasNode['data']>
}

export interface MoveNodeAction {
  type: 'move_node'
  id: string
  position: { x: number; y: number }
}

export interface DeleteNodeAction {
  type: 'delete_node'
  id: string
}

export interface DeleteEdgeAction {
  type: 'delete_edge'
  id: string
}

export interface ClearCanvasAction {
  type: 'clear_canvas'
}

export interface SelectAction {
  type: 'select'
  ids: string[]
}

/** Re-arrange every node into a clean left-to-right (or top-to-bottom) flow
    using topological rank from the wired edges. The Director uses this when
    the canvas gets messy, when the user asks to "tidy" / "clean up" /
    "organize", or as a final polish step after adding several nodes.
    Optional knobs let the AI bias toward tighter or looser layouts. */
export interface AutoLayoutAction {
  type: 'auto_layout'
  /** Flow direction. 'LR' (default) reads left-to-right like a sentence;
      'TB' stacks top-to-bottom for tall narrow viewports or storyboard rails. */
  direction?: 'LR' | 'TB'
  /** Horizontal gap between rank columns (default 320). */
  columnGap?: number
  /** Vertical gap between siblings in the same rank (default 200). */
  rowGap?: number
  /** Origin x/y to seed the top-left of the laid-out graph. Defaults to
      a viewport-aware origin set by the client. */
  origin?: { x: number; y: number }
  /** When true (default), call rfInstance.fitView after applying so the user
      sees the whole graph. */
  fitAfter?: boolean
}

/** Returned from `applyAction()` so the Director chat can echo a status
    bubble in the thread AND send a follow-up message to the AI so it sees
    what happened on its next turn. */
export interface ActionResult {
  ok: boolean
  /** Short human summary, e.g. "Created 2 nodes, 1 edge." */
  summary: string
  /** Per-action outcomes for debug logging. */
  applied: number
  rejected: number
  errors: string[]
  /** Set when the user clicked Cancel on the confirmation card. */
  cancelled?: boolean
}

/** Action categories used by `applyAction` to decide silent-apply vs confirm. */
export function isDestructiveAction(action: CanvasAction): boolean {
  return (
    action.type === 'delete_node' ||
    action.type === 'delete_edge' ||
    action.type === 'clear_canvas'
  )
}

/** True when the payload contains at least one destructive action. */
export function hasDestructiveAction(payload: CanvasActionPayload): boolean {
  return payload.actions.some(isDestructiveAction)
}
