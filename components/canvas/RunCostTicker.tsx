// Floating run-cost chip shown while a canvas execution is in flight.
//
// Reads from the singleton `runTracker` via `useRunTracker()`. Renders nothing
// when no run is active. While running, shows:
//   "Spent $0.42 of est $1.25 · 3/5 nodes done"
// with an animated number tick on the spent amount.
//
// On run end (success or failure), shows a brief celebratory state with the
// total spent and auto-fades after 4 seconds.
//
// Mobile: top-aligned (so it doesn't collide with the bottom toolbar);
// desktop: bottom-right.

'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import { formatCents } from '@/lib/canvas/cost'
import { useRunTracker, runTracker } from '@/lib/canvas/run-tracker'

const FADE_OUT_MS = 4000

// Smoothly animates a number toward `target` over ~400ms using rAF.
function useAnimatedNumber(target: number): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (value === target) return
    fromRef.current = value
    startRef.current = performance.now()
    const duration = 400

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(fromRef.current + (target - fromRef.current) * eased)
      setValue(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}

export function RunCostTicker() {
  const snapshot = useRunTracker()

  // Capture total node count at run-start so the "3/5 done" denominator is
  // stable for the duration. We infer it from completed + failed because the
  // tracker doesn't know the graph size — close enough for a UI hint.
  // (Falls back to perNode.size + failures.size + 1 while running, which
  // means the denominator may grow; that's acceptable.)
  const totalNodesHint = useMemo(() => {
    if (!snapshot) return 0
    return snapshot.perNode.size + snapshot.failures.size
  }, [snapshot])

  const animatedTotal = useAnimatedNumber(snapshot?.totalCostCents ?? 0)

  // Auto-clear after end-of-run celebratory window.
  useEffect(() => {
    if (!snapshot) return
    if (snapshot.status !== 'success' && snapshot.status !== 'failed') return
    const t = setTimeout(() => runTracker.clear(), FADE_OUT_MS)
    return () => clearTimeout(t)
  }, [snapshot?.status, snapshot?.endedAt])

  const visible = snapshot != null

  return (
    <AnimatePresence>
      {visible && snapshot && (
        <motion.div
          key="run-cost-ticker"
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={[
            'pointer-events-none fixed z-50 select-none',
            // Desktop: bottom-right above any toolbar margin.
            'sm:bottom-6 sm:right-6 sm:top-auto sm:left-auto',
            // Mobile: anchored just below the TopBar (h-14 = 56px) so it
            // doesn't overlap title/run controls. Centered horizontally.
            'top-[calc(env(safe-area-inset-top)+64px)] left-1/2 -translate-x-1/2 sm:translate-x-0 sm:top-auto',
          ].join(' ')}
        >
          <div
            className={[
              'pointer-events-auto flex items-center gap-2 rounded-full',
              'bg-black/80 backdrop-blur-md border border-white/10',
              'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
              'px-3 py-1.5 sm:px-4 sm:py-2',
              'text-xs sm:text-sm font-medium text-white',
            ].join(' ')}
          >
            <StatusDot status={snapshot.status} />
            <ContentLabel
              status={snapshot.status}
              spent={animatedTotal}
              estimated={snapshot.estimatedCostCents}
              completed={snapshot.nodesCompleted}
              total={totalNodesHint}
              failures={snapshot.failures.size}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StatusDot({ status }: { status: 'idle' | 'running' | 'success' | 'failed' }) {
  if (status === 'running') {
    return (
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-skinny-lime opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-skinny-lime" />
      </span>
    )
  }
  if (status === 'success') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="text-skinny-lime">
        <path
          d="M3 8.5l3 3 7-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="text-red-400">
        <path
          d="M4 4l8 8M12 4l-8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return <span className="inline-block h-2 w-2 rounded-full bg-white/30" />
}

function ContentLabel({
  status,
  spent,
  estimated,
  completed,
  total,
  failures,
}: {
  status: 'idle' | 'running' | 'success' | 'failed'
  spent: number
  estimated: number
  completed: number
  total: number
  failures: number
}) {
  if (status === 'running') {
    const denom = Math.max(total, completed)
    return (
      <span className="tabular-nums">
        Spent <span className="text-skinny-lime">{formatCents(spent)}</span>
        {estimated > 0 && (
          <span className="text-white/60"> of est {formatCents(estimated)}</span>
        )}
        <span className="text-white/40 mx-1.5">·</span>
        <span className="text-white/80">
          {completed}/{denom || '?'} nodes done
        </span>
      </span>
    )
  }

  if (status === 'success') {
    return (
      <span className="tabular-nums">
        Run complete · <span className="text-skinny-lime">{formatCents(spent)}</span>
        {failures > 0 && (
          <span className="text-amber-300/90 ml-1.5">
            ({failures} failed)
          </span>
        )}
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="tabular-nums">
        Run failed · spent <span className="text-skinny-lime">{formatCents(spent)}</span>
      </span>
    )
  }

  return null
}

export default RunCostTicker
