'use client'

// Pre-run confirmation surface.
//
// Shown before kicking off a canvas execution so users can:
//  1. See validation issues (missing inputs, no model picked, Seedance mutex
//     conflicts, etc.) and BLOCK if anything is broken — `preflightCanvas`
//     returns `ok=false` and the run button is disabled.
//  2. Confirm cost vs available balance once the graph is actually runnable.
//
// On desktop renders as a centered modal card; on mobile (`< sm`) collapses
// into a bottom-sheet for thumb-friendly tapping.
//
// When `balanceCents < estimatedCostCents` and the user is not on lifetime,
// the confirm button is blocked and a "Top up to run" link is shown.
//
// Designed to be triggered programmatically by the parent (CanvasShell):
//   const [checkOpen, setCheckOpen] = useState(false)
//   <PreRunCheck open={checkOpen} onClose={() => setCheckOpen(false)}
//     onConfirm={() => { setCheckOpen(false); runCanvas() }}
//     estimatedCostCents={estimatedCostCents}
//     canvas={canvas}
//     onSelectNode={(id) => focusNode(id)} />
//
// NOTE TO CANVASSHELL OWNER: PreRunCheck now accepts two new props —
//   - `canvas: Canvas` — required so we can run pre-flight validation
//   - `onSelectNode?: (nodeId: string) => void` — optional. When provided,
//      each error row gets a "Jump to node" affordance that calls this with
//      the offending node id. CanvasShell should pass its existing
//      `setSelectedNodeId(id)` (or equivalent focus handler) here.

import { useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet,
  Play,
  X,
  AlertTriangle,
  AlertCircle,
  Infinity as InfinityIcon,
  ArrowRight,
} from 'lucide-react'
import { useUser } from '@/lib/context/user-context'
import { formatCents } from '@/lib/canvas/cost'
import { Canvas } from '@/lib/canvas/ir'
import {
  preflightCanvas,
  NodeValidationIssue,
  PreflightResult,
} from '@/lib/canvas/preflight'

interface PreRunCheckProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  estimatedCostCents: number
  /** Required to drive pre-flight validation. Pass the current canvas. */
  canvas?: Canvas
  /** Called when the user clicks "Jump to node" on a validation error. */
  onSelectNode?: (nodeId: string) => void
  /** Optional override for the top-up link target. */
  topUpHref?: string
}

export function PreRunCheck({
  open,
  onClose,
  onConfirm,
  estimatedCostCents,
  canvas,
  onSelectNode,
  topUpHref = '/?settings=balance',
}: PreRunCheckProps) {
  const { profile, balanceCents, balanceDollars } = useUser()
  const isLifetime = !!profile?.lifetime_access
  const insufficient = !isLifetime && balanceCents < estimatedCostCents
  const balanceAfter = Math.max(0, balanceCents - estimatedCostCents)
  // Single ref typed to the union so the same handle works whether the
  // primary action renders as a <button> (confirm) or <a> (top-up).
  const confirmRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null)

  // Pre-flight validation — only runs when the modal is open AND we have a
  // canvas. If `canvas` is undefined (legacy callers), preflight is skipped
  // and the modal behaves as before.
  const preflight: PreflightResult = useMemo(() => {
    if (!open || !canvas) {
      return { ok: true, issues: [], errors: [], warnings: [] }
    }
    return preflightCanvas(canvas)
  }, [open, canvas])

  const hasErrors = preflight.errors.length > 0
  const blockedByErrors = hasErrors
  const blocked = blockedByErrors || insufficient

  // Close on Escape. Cmd/Ctrl+Enter confirms (matches the canvas-wide
  // shortcut contract — never a bare Enter, which can collide with form
  // submission elsewhere in the iframe).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !blocked) {
        e.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, blocked, onClose, onConfirm])

  // Focus the confirm button when opened so keyboard users can hit Enter
  // immediately (one tab if they want to Cancel).
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => confirmRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [open])

  // Group issues by node so users see one card per problem node instead of
  // a flat list when multiple errors hit the same node.
  const errorGroups = useMemo(() => groupByNode(preflight.errors), [preflight.errors])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="prerun-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            key="prerun-card"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[440px] max-h-[88vh] overflow-y-auto bg-zinc-950/95 backdrop-blur-md sm:rounded-2xl rounded-t-2xl ring-1 ring-white/[0.06] shadow-2xl p-5 sm:p-6 relative"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prerun-title"
          >
            {/* Mobile drag handle */}
            <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/10" />

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors after:absolute after:-inset-2 after:content-['']"
            >
              <X size={14} aria-hidden />
            </button>

            <h2 id="prerun-title" className="text-zinc-100 text-base font-semibold pr-8">
              {hasErrors ? 'Fix these to run' : 'Run this canvas?'}
            </h2>
            <p className="text-zinc-400 text-xs mt-1">
              {hasErrors
                ? `${preflight.errors.length} issue${preflight.errors.length === 1 ? '' : 's'} blocking the run.`
                : 'Nodes run in order. Your balance is debited as each one finishes.'}
            </p>

            {/* === Validation errors ============================== */}
            {hasErrors && (
              <div className="mt-4 space-y-2">
                {errorGroups.map((group) => (
                  <ErrorGroupRow
                    key={group.nodeId}
                    group={group}
                    onSelectNode={onSelectNode}
                    onClose={onClose}
                  />
                ))}
              </div>
            )}

            {/* === Warnings (non-blocking) ========================= */}
            {!hasErrors && preflight.warnings.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-300 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-200 leading-relaxed space-y-1">
                    <div className="font-medium text-amber-100">
                      {preflight.warnings.length} thing{preflight.warnings.length === 1 ? '' : 's'} to note
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 marker:text-amber-400/60">
                      {preflight.warnings.map((w, i) => (
                        <li key={`${w.nodeId}-${i}`}>
                          <span className="text-amber-100/90">{w.nodeTitle || 'Node'}:</span>{' '}
                          {w.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* === Cost / balance summary (only when not blocked by errors) === */}
            {!hasErrors && (
              <div className="mt-5 rounded-xl bg-white/[0.02] ring-1 ring-white/[0.05] divide-y divide-white/[0.04]">
                <Row label="Estimated cost" value={formatCents(estimatedCostCents)} accent="text-zinc-100" />
                <Row
                  label="Your balance"
                  value={
                    isLifetime ? (
                      <span className="inline-flex items-center gap-1.5">
                        <InfinityIcon size={14} className="text-skinny-yellow" strokeWidth={2.5} />
                        <span className="text-[10px] font-medium uppercase tracking-wider text-skinny-yellow/90">
                          Lifetime
                        </span>
                      </span>
                    ) : (
                      `$${balanceDollars}`
                    )
                  }
                  accent="text-zinc-300"
                  icon={<Wallet size={12} className="text-skinny-yellow" />}
                />
                {!isLifetime && (
                  <Row
                    label="Balance after run"
                    value={`$${(balanceAfter / 100).toFixed(2)}`}
                    accent={insufficient ? 'text-rose-300' : 'text-zinc-400'}
                  />
                )}
              </div>
            )}

            {insufficient && !hasErrors && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/25 px-3 py-2.5">
                <AlertTriangle size={14} className="text-rose-300 mt-0.5 shrink-0" />
                <div className="text-xs text-rose-200 leading-relaxed">
                  Not enough balance. This run needs{' '}
                  <span className="font-mono">{formatCents(estimatedCostCents)}</span> but you have
                  only <span className="font-mono">${balanceDollars}</span>.
                </div>
              </div>
            )}

            {/* === Actions === */}
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 sm:h-10 px-4 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] hover:bg-white/[0.08] text-zinc-300 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors"
              >
                Cancel
              </button>

              {hasErrors ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="flex-1 h-11 sm:h-10 px-4 rounded-md bg-white/[0.06] text-zinc-500 text-sm font-medium cursor-not-allowed ring-1 ring-rose-500/30 flex items-center justify-center gap-2"
                >
                  <AlertCircle size={14} className="text-rose-400" aria-hidden />
                  Fix issues to run
                </button>
              ) : insufficient ? (
                <a
                  href={topUpHref}
                  ref={(el) => {
                    confirmRef.current = el
                  }}
                  className="flex-1 h-11 sm:h-10 px-4 rounded-md bg-skinny-yellow text-zinc-900 text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-all"
                >
                  <Wallet size={14} aria-hidden />
                  Top up to run
                </a>
              ) : (
                <button
                  type="button"
                  ref={(el) => {
                    confirmRef.current = el
                  }}
                  onClick={onConfirm}
                  className="flex-1 h-11 sm:h-10 px-4 rounded-md bg-white text-zinc-900 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-colors"
                  aria-label={`Run canvas now for ${formatCents(estimatedCostCents)}`}
                >
                  <Play size={12} fill="currentColor" className="text-skinny-green" aria-hidden />
                  Run now
                  <span className="hidden sm:inline text-[10px] font-mono text-zinc-500 ml-1">
                    {formatCents(estimatedCostCents)}
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// === Internal row primitive ================================================
function Row({
  label,
  value,
  accent = 'text-zinc-200',
  icon,
}: {
  label: string
  value: React.ReactNode
  accent?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-mono ${accent}`}>{value}</span>
    </div>
  )
}

// === Error grouping ========================================================

interface ErrorGroup {
  nodeId: string
  nodeTitle?: string
  nodeType: string
  issues: NodeValidationIssue[]
}

function groupByNode(issues: NodeValidationIssue[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>()
  for (const issue of issues) {
    let g = groups.get(issue.nodeId)
    if (!g) {
      g = {
        nodeId: issue.nodeId,
        nodeTitle: issue.nodeTitle,
        nodeType: issue.nodeType,
        issues: [],
      }
      groups.set(issue.nodeId, g)
    }
    g.issues.push(issue)
  }
  return Array.from(groups.values())
}

function ErrorGroupRow({
  group,
  onSelectNode,
  onClose,
}: {
  group: ErrorGroup
  onSelectNode?: (id: string) => void
  onClose: () => void
}) {
  const handleJump = () => {
    if (!onSelectNode) return
    onSelectNode(group.nodeId)
    onClose()
  }
  return (
    <div className="rounded-lg bg-rose-500/[0.08] ring-1 ring-rose-500/25 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle size={14} className="text-rose-300 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xs font-medium text-rose-100 truncate">
              {group.nodeTitle || group.nodeType}
            </div>
            {onSelectNode && (
              <button
                type="button"
                onClick={handleJump}
                className="text-[10px] uppercase tracking-wider text-rose-200/80 hover:text-rose-100 inline-flex items-center gap-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40 rounded px-1"
              >
                Jump to node
                <ArrowRight size={10} aria-hidden />
              </button>
            )}
          </div>
          <ul className="mt-1 space-y-0.5">
            {group.issues.map((issue, i) => (
              <li
                key={`${issue.code}-${i}`}
                className="text-xs text-rose-200/95 leading-relaxed"
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
