'use client'

// Centered confirmation card for destructive AI-proposed canvas mutations.
// The Director can emit `delete_node`, `delete_edge`, or `clear_canvas`
// actions; we don't apply those silently. Instead applyAction() opens this
// card, lets the user see exactly what's about to be removed, and resolves
// a Promise once they Apply / Cancel.
//
// Mounted by CanvasShell. The shell owns the `pendingDestructiveAction`
// state + the Promise resolver so applyAction() can await user confirmation.

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { AlertTriangle, X, Check } from 'lucide-react'
import type {
  CanvasAction,
  DeleteNodeAction,
  DeleteEdgeAction,
} from '@/lib/canvas/director-actions'

export interface PendingDestructive {
  /** All actions queued in the current block — we show the destructive ones
      in the diff but apply additive ones too on confirm. */
  actions: CanvasAction[]
  /** Resolves with `true` on Apply, `false` on Cancel. */
  resolve: (apply: boolean) => void
  /** What the affected nodes/edges look like RIGHT NOW so we can show a
      meaningful preview (titles, model slugs) — caller passes a snapshot. */
  preview: {
    nodes: { id: string; title: string; type: string }[]
    edges: { id: string; sourceTitle: string; targetTitle: string }[]
    isClearAll: boolean
  }
}

export function ConfirmActionsCard({
  pending,
}: {
  pending: PendingDestructive | null
}) {
  // Esc cancels. Cmd/Ctrl+Enter confirms (bare Enter would be too easy to
  // hit when reading the diff — destructive actions deserve the friction).
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        pending.resolve(false)
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        pending.resolve(true)
      }
    }
    window.addEventListener('keydown', onKey)
    // Focus the cancel button by default — safer when a destructive primary
    // is in scope.
    const t = window.setTimeout(() => cancelRef.current?.focus(), 80)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
    }
  }, [pending])

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          key="confirm-destructive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => pending.resolve(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm destructive canvas changes"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-zinc-950 ring-1 ring-white/10 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 ring-1 ring-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-rose-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {pending.preview.isClearAll
                    ? 'Clear the whole canvas?'
                    : `Apply ${pending.preview.nodes.length + pending.preview.edges.length} deletion${
                        pending.preview.nodes.length + pending.preview.edges.length === 1
                          ? ''
                          : 's'
                      }?`}
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Suggested by Creative Director — review before applying.
                </p>
              </div>
            </div>

            {/* Diff preview */}
            <div className="px-5 py-3 max-h-[40vh] overflow-y-auto space-y-2">
              {pending.preview.isClearAll && (
                <p className="text-[12px] text-zinc-300">
                  Every node and connection on this canvas will be removed. You
                  can <span className="text-skinny-yellow">⌘Z</span> right
                  after to restore.
                </p>
              )}

              {!pending.preview.isClearAll && pending.preview.nodes.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                    Nodes ({pending.preview.nodes.length})
                  </div>
                  <ul className="space-y-1">
                    {pending.preview.nodes.map((n) => (
                      <li
                        key={n.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-rose-500/[0.06] ring-1 ring-rose-500/15 text-[12px] text-zinc-200"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400/80" />
                        <span className="truncate flex-1">{n.title}</span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {n.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!pending.preview.isClearAll && pending.preview.edges.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                    Connections ({pending.preview.edges.length})
                  </div>
                  <ul className="space-y-1">
                    {pending.preview.edges.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-rose-500/[0.06] ring-1 ring-rose-500/15 text-[12px] text-zinc-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400/80" />
                        <span className="truncate">
                          {e.sourceTitle} <span className="text-zinc-600">→</span>{' '}
                          {e.targetTitle}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
              <p className="hidden sm:flex items-center gap-1.5 text-[10px] text-zinc-600">
                <kbd className="px-1 py-px rounded bg-white/[0.06] ring-1 ring-white/[0.08] text-[10px] font-mono text-zinc-400">Esc</kbd>
                cancel
                <span className="text-zinc-700 mx-1">·</span>
                <kbd className="px-1 py-px rounded bg-white/[0.06] ring-1 ring-white/[0.08] text-[10px] font-mono text-zinc-400">⌘↵</kbd>
                apply
              </p>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  ref={cancelRef}
                  onClick={() => pending.resolve(false)}
                  className="flex items-center gap-1.5 h-11 sm:h-9 px-4 sm:px-3 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] hover:bg-white/[0.08] text-xs text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors"
                >
                  <X size={12} aria-hidden />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => pending.resolve(true)}
                  className="flex items-center gap-1.5 h-11 sm:h-9 px-4 sm:px-3 rounded-md bg-rose-500/90 hover:bg-rose-500 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-colors"
                >
                  <Check size={12} aria-hidden />
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Helper for callers (CanvasShell.applyAction): extract the destructive
    actions from a payload so we can build the preview snapshot. */
export function destructiveActions(
  actions: CanvasAction[],
): Array<DeleteNodeAction | DeleteEdgeAction | { type: 'clear_canvas' }> {
  return actions.filter(
    (a) =>
      a.type === 'delete_node' ||
      a.type === 'delete_edge' ||
      a.type === 'clear_canvas',
  ) as Array<DeleteNodeAction | DeleteEdgeAction | { type: 'clear_canvas' }>
}
