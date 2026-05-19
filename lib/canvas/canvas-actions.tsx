'use client'

// Context that lets node renderers AND the Creative Director call back into
// the CanvasShell — running, generation history cycling, and (new) tool-use
// mutations from natural language.
//
// applyAction() is the entry point for the Director's `canvas-action` blocks:
// it remaps temporary ids, validates each action, runs additive ones silently
// (with history push so ⌘Z undoes them), and surfaces destructive ones to a
// confirmation card before applying.

import { createContext, useContext, ReactNode } from 'react'
import type { NodeType, CanvasNode } from './ir'
import type {
  CanvasActionPayload,
  ActionResult,
} from './director-actions'

export interface CanvasActions {
  // ---- Run controls (existing) ------------------------------------------
  /** Run a single model node + everything upstream of it. */
  runFromNode: (nodeId: string) => void
  /** True while one OR MORE runs are in flight. Multi-run is allowed —
   *  callers should NOT use this to disable other nodes' Run buttons. */
  isRunning: boolean
  /** Abort EVERY active run. Used by the TopBar's global Stop button. */
  stopRun: () => void
  /** Abort just the run that contains this node id. Used by the per-node
   *  spinner so killing one run doesn't kill the others. */
  stopRunForNode: (nodeId: string) => void

  // ---- Per-generation navigation (existing) ----------------------------
  /** Flip to the previous (delta=-1) or next (delta=+1) saved generation
      on a model node — Runway's `< 1/N >` toggle. */
  cycleGeneration: (nodeId: string, delta: number) => void
  /** Rename the currently-displayed generation entry on a node. */
  setGenerationLabel: (nodeId: string, label: string) => void

  // ---- New: Director tool-use mutations --------------------------------
  /** Append a new node. Returns the real (UUID) id of the created node. */
  addNode: (input: {
    nodeType: NodeType
    position?: { x: number; y: number }
    data?: Partial<CanvasNode['data']>
  }) => string
  /** Wire two nodes. Rejects if handles are incompatible or a cycle would
      form; returns { ok:false, reason } so the AI can see the rejection
      and try a different wiring on its next turn. */
  connectNodes: (
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
  ) => { ok: boolean; reason?: string }
  /** Patch a node's data (prompt edits, param changes, model swap). */
  updateNode: (id: string, patch: Partial<CanvasNode['data']>) => void
  /** Move a node to a new absolute position. */
  moveNode: (id: string, position: { x: number; y: number }) => void
  /** Set selection to exactly the given ids. */
  selectNodes: (ids: string[]) => void
  /** Top-level dispatcher for an entire `canvas-action` block. Handles
      tmp-id remapping, validates, splits additive vs destructive, and
      returns a summary the Director chat can echo to the user + AI. */
  applyAction: (payload: CanvasActionPayload) => Promise<ActionResult>
}

const CanvasActionsContext = createContext<CanvasActions | null>(null)

export function CanvasActionsProvider({
  value,
  children,
}: {
  value: CanvasActions
  children: ReactNode
}) {
  return (
    <CanvasActionsContext.Provider value={value}>
      {children}
    </CanvasActionsContext.Provider>
  )
}

/** Safe to call from any node renderer. Returns null when not in a canvas. */
export function useCanvasActions(): CanvasActions | null {
  return useContext(CanvasActionsContext)
}
