// Per-run cost tracker for the canvas.
//
// Holds the state of an in-flight canvas execution so the UI can surface
// "we just spent X¢ on node Y" as nodes complete, and accumulate a running
// run-total without re-fetching balance from /api/users/me on every tick.
//
// This module is intentionally tiny: it's a singleton store with a
// subscribe/snapshot API consumable by `useSyncExternalStore`. No external
// state library (no zustand / redux / jotai) — keeps bundle weight at zero.
//
// =============================================================================
// Wiring contract for the orchestrator (CanvasShell):
// =============================================================================
//
// The executor in `lib/canvas/executor.ts` exposes a single `onNodeUpdate(
// nodeId, patch)` callback that fires whenever a node's status/output
// changes. The canvas shell should wrap (NOT replace) its own onNodeUpdate
// to forward run-tracker calls:
//
//   import { runTracker } from '@/lib/canvas/run-tracker'
//   import { estimateCanvasCost } from '@/lib/canvas/cost'
//
//   // BEFORE calling runCanvas:
//   runTracker.startRun(canvas.id, estimateCanvasCost(canvas, modelBySlug))
//
//   await runCanvas(canvas, {
//     ...,
//     onNodeUpdate: (nodeId, patch) => {
//       patchNode(nodeId, patch)                   // existing UI patch
//       if (patch.status === 'done') {
//         runTracker.recordNodeCompleted(nodeId, patch.costCents || 0)
//       } else if (patch.status === 'error') {
//         runTracker.recordNodeFailed(nodeId, patch.error || 'Unknown error')
//       }
//     },
//   })
//
//   // AFTER runCanvas resolves / rejects:
//   runTracker.endRun(didSucceed)
//
// The tracker is purely additive — if `startRun` is never called, all
// `recordNodeCompleted` calls become no-ops, so partial adoption is safe.
//
// Subscribers (e.g. RunCostTicker) use `useRunTracker()` to read state.

'use client'

import { useSyncExternalStore } from 'react'

// === Types ==================================================================

export type RunStatus = 'idle' | 'running' | 'success' | 'failed'

export interface RunSnapshot {
  canvasId: string
  startedAt: number
  endedAt: number | null
  estimatedCostCents: number
  totalCostCents: number
  perNode: Map<string, number>
  failures: Map<string, string>
  nodesCompleted: number
  status: RunStatus
}

// === Store ==================================================================

type Listener = () => void

class RunTrackerStore {
  private current: RunSnapshot | null = null
  private listeners = new Set<Listener>()

  // Cached identity reference for getSnapshot — `useSyncExternalStore`
  // requires referential stability when nothing changed.
  private snapshotRef: RunSnapshot | null = null

  startRun(canvasId: string, estimatedCostCents: number): void {
    this.current = {
      canvasId,
      startedAt: Date.now(),
      endedAt: null,
      estimatedCostCents: Math.max(0, estimatedCostCents | 0),
      totalCostCents: 0,
      perNode: new Map(),
      failures: new Map(),
      nodesCompleted: 0,
      status: 'running',
    }
    this.commit()
  }

  recordNodeCompleted(nodeId: string, actualCostCents: number): void {
    if (!this.current || this.current.status !== 'running') return
    const cost = Math.max(0, actualCostCents | 0)
    // Idempotent: re-recording the same node replaces (does not accumulate)
    // the previous value, so flaky callbacks don't double-charge.
    const previous = this.current.perNode.get(nodeId) ?? 0
    const wasCompleted = this.current.perNode.has(nodeId)
    this.current.perNode.set(nodeId, cost)
    this.current.totalCostCents += cost - previous
    if (!wasCompleted) this.current.nodesCompleted += 1
    this.commit()
  }

  recordNodeFailed(nodeId: string, errorMsg: string): void {
    if (!this.current || this.current.status !== 'running') return
    this.current.failures.set(nodeId, errorMsg || 'Unknown error')
    this.commit()
  }

  endRun(success: boolean): void {
    if (!this.current) return
    this.current.endedAt = Date.now()
    this.current.status = success ? 'success' : 'failed'
    this.commit()
  }

  // Clears the current run from memory. Called by the ticker after the
  // celebratory fade-out so a stale chip doesn't linger.
  clear(): void {
    this.current = null
    this.commit()
  }

  getCurrent(): RunSnapshot | null {
    return this.snapshotRef
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private commit(): void {
    // Build a new identity for the snapshot so `useSyncExternalStore`
    // detects a change. Maps are cloned shallowly for the same reason.
    this.snapshotRef = this.current
      ? {
          ...this.current,
          perNode: new Map(this.current.perNode),
          failures: new Map(this.current.failures),
        }
      : null
    for (const listener of Array.from(this.listeners)) {
      try {
        listener()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[RunTrackerStore] listener threw:', err)
      }
    }
  }
}

export const runTracker = new RunTrackerStore()

// === Hook ===================================================================

/**
 * Reactive hook returning the current run snapshot (or `null` between runs).
 * Re-renders the calling component whenever any tracker state changes.
 */
export function useRunTracker(): RunSnapshot | null {
  return useSyncExternalStore(
    runTracker.subscribe,
    () => runTracker.getCurrent(),
    () => null, // server snapshot — no run exists during SSR
  )
}
