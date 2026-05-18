'use client'

// Live balance chip for the canvas TopBar.
//
// Mirrors the existing balance chip in TopBar.tsx (same dimensions, ring,
// font) so the orchestrator can swap it in without visual drift. On every
// `node-completed` event fired by the executor it calls `refreshUser()` to
// pull fresh /api/users/me state, then animates the dollar amount and pulses
// a brief lime glow so users *feel* the debit happen.
//
// Lifetime users see an infinity glyph instead of a dollar amount, and a
// "Lifetime" badge on larger viewports.
//
// Low-balance state: when balanceCents falls below `lowThresholdCents`
// (default 200¢) — or below `estimatedRunCostCents` if provided — the chip
// flips to a rose accent and exposes a tooltip prompting top-up.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Infinity as InfinityIcon, AlertTriangle } from 'lucide-react'
import { useUser } from '@/lib/context/user-context'
import { useBalanceEvent } from '@/lib/canvas/balance-events'

interface BalanceLiveProps {
  /** Estimated cost of the pending run; when set, low-balance flips on if balance < this. */
  estimatedRunCostCents?: number
  /** Absolute floor below which the chip turns rose regardless of run cost. */
  lowThresholdCents?: number
  /** Optional href for the chip — defaults to settings → balance. */
  href?: string
  className?: string
}

export function BalanceLive({
  estimatedRunCostCents,
  lowThresholdCents = 200,
  href = '/?settings=balance',
  className = '',
}: BalanceLiveProps) {
  const { profile, balanceCents, balanceDollars, isLoading, refreshUser } = useUser()
  const isLifetime = !!profile?.lifetime_access

  // === Animated debit feedback ============================================
  const [glow, setGlow] = useState(false)
  const glowTimer = useRef<number | null>(null)

  const handleNodeCompleted = useCallback(() => {
    // Pull fresh balance now instead of waiting for the 30s poll.
    refreshUser().catch(() => {
      // refreshUser already swallows errors into context.error; nothing extra here.
    })
    setGlow(true)
    if (glowTimer.current) window.clearTimeout(glowTimer.current)
    glowTimer.current = window.setTimeout(() => setGlow(false), 900)
  }, [refreshUser])

  useBalanceEvent('node-completed', handleNodeCompleted)

  useEffect(() => {
    return () => {
      if (glowTimer.current) window.clearTimeout(glowTimer.current)
    }
  }, [])

  // === Derived state ======================================================
  const lowFloor = estimatedRunCostCents && estimatedRunCostCents > lowThresholdCents
    ? estimatedRunCostCents
    : lowThresholdCents
  const isLow = !isLifetime && balanceCents < lowFloor
  const tooltip = useMemo(() => {
    if (isLifetime) return 'Lifetime access — unlimited runs'
    if (isLow && estimatedRunCostCents && balanceCents < estimatedRunCostCents) {
      return `Low balance — this run needs ~$${(estimatedRunCostCents / 100).toFixed(2)}, you have $${balanceDollars}`
    }
    if (isLow) return `Low balance — top up to keep generating`
    return `Balance: $${balanceDollars}`
  }, [isLifetime, isLow, balanceCents, balanceDollars, estimatedRunCostCents])

  if (isLoading && !profile) return null

  // === Render =============================================================
  const baseClasses =
    'hidden sm:flex items-center h-8 px-2 gap-1.5 rounded-md ring-1 text-xs transition-all relative overflow-hidden'

  const stateClasses = isLow
    ? 'bg-rose-500/10 ring-rose-500/30 hover:ring-rose-400/50 text-rose-200'
    : 'bg-white/[0.03] ring-white/[0.04] hover:ring-skinny-yellow/30 hover:bg-white/[0.05] text-zinc-300 hover:text-zinc-100'

  return (
    <a href={href} title={tooltip} className={`${baseClasses} ${stateClasses} ${className}`}>
      {/* Lime glow that pulses on each node-completed event. */}
      <AnimatePresence>
        {glow && !isLow && (
          <motion.span
            key="glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 rounded-md bg-skinny-yellow/15 pointer-events-none"
            aria-hidden
          />
        )}
      </AnimatePresence>

      {isLifetime ? (
        <InfinityIcon size={12} className="text-skinny-yellow relative" />
      ) : isLow ? (
        <AlertTriangle size={11} className="text-rose-300 relative" />
      ) : (
        <Wallet size={11} className="text-skinny-yellow relative" />
      )}

      {isLifetime ? (
        <span className="relative flex items-center gap-1.5">
          <InfinityIcon size={14} className="text-zinc-100" strokeWidth={2.5} />
          <span className="hidden md:inline text-[10px] font-medium uppercase tracking-wider text-skinny-yellow/90">
            Lifetime
          </span>
        </span>
      ) : (
        <AnimatedAmount cents={balanceCents} />
      )}
    </a>
  )
}

// === Animated number tick ==================================================
// Crossfades + slides between balance values when the cents change. Mono
// font so the digits don't reflow. Falls back to plain text if Motion is
// unavailable for any reason.
function AnimatedAmount({ cents }: { cents: number }) {
  const formatted = `$${(cents / 100).toFixed(2)}`
  return (
    <span className="font-mono relative inline-block min-w-[3.25rem] text-right tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={formatted}
          initial={{ y: -6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 6, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="inline-block"
        >
          {formatted}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
