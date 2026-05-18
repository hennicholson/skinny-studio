'use client'

// Floating left rail. Two things only — the things that actually work and
// have value in the editor:
//   1. A vertical segmented Canvas/Timeline mode selector (always visible).
//   2. Add Node — canvas-mode only.
//
// Removed: "All canvases" (TopBar already has a back arrow) and "Tags"
// (no functionality wired up — was a placeholder).
//
// Styling matches BottomToolbar's `bg-zinc-950/95 backdrop-blur-md
// ring-1 ring-white/[0.08] rounded-xl shadow-2xl` shell so the two floating
// docks read as a system. Tighter than before so it stops feeling like an
// empty column.
//
// On phones: drops to bottom-left in a compact mode so it doesn't fight the
// thumb-reach BottomToolbar for vertical center real-estate.

import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Plus, Workflow, Film } from 'lucide-react'

interface LeftRailProps {
  onAdd: () => void
  /** Optional: when the add-node modal is open, the + glows lime. */
  addOpen?: boolean
  /** Surface mode for the segmented selector at the top of the rail. */
  mode: 'canvas' | 'timeline'
  /** Setter for the segmented selector. */
  setMode: (m: 'canvas' | 'timeline') => void
}

export function LeftRail({ onAdd, addOpen = false, mode, setMode }: LeftRailProps) {
  return (
    <div
      className={[
        'absolute z-30 flex flex-col gap-1 bg-zinc-950/95 backdrop-blur-md ring-1 ring-white/[0.08] rounded-xl shadow-2xl',
        // Desktop / sm+ : vertical-centered dock, tight padding so the rail
        // stops looking like a tall empty column.
        'sm:left-3 sm:top-1/2 sm:-translate-y-1/2 sm:p-1',
        // Mobile: compact, bottom-left, above safe-area
        'left-2 bottom-[calc(env(safe-area-inset-bottom)+88px)] p-1',
      ].join(' ')}
    >
      <ModeSegmentedSelector mode={mode} setMode={setMode} />

      {mode === 'canvas' && (
        <>
          <RailDivider />
          <RailButton
            label="Add node"
            hint="/"
            onClick={onAdd}
            active={addOpen}
          >
            <Plus size={15} strokeWidth={2.2} />
          </RailButton>
        </>
      )}
    </div>
  )
}

/* ─────────────────── Mode selector (segmented vertical) ────────────────── */

function ModeSegmentedSelector({
  mode,
  setMode,
}: {
  mode: 'canvas' | 'timeline'
  setMode: (m: 'canvas' | 'timeline') => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Surface mode"
      className="flex flex-col gap-0.5 rounded-lg bg-black/40 ring-1 ring-white/[0.06] p-0.5"
    >
      <SegmentTab
        active={mode === 'canvas'}
        onClick={() => setMode('canvas')}
        label="Canvas"
        hint="1"
      >
        <Workflow size={15} strokeWidth={2.1} />
      </SegmentTab>
      <SegmentTab
        active={mode === 'timeline'}
        onClick={() => setMode('timeline')}
        label="Timeline"
        hint="2"
      >
        <Film size={15} strokeWidth={2.1} />
      </SegmentTab>
    </div>
  )
}

function SegmentTab({
  active,
  onClick,
  label,
  hint,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <RailTooltip label={label} hint={hint}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={`Switch to ${label.toLowerCase()} mode`}
        onClick={onClick}
        className={[
          'w-11 h-11 sm:w-9 sm:h-9 rounded-md flex items-center justify-center transition-all duration-150',
          active
            ? 'bg-skinny-yellow text-black shadow-[0_0_18px_-4px_rgba(214,252,81,0.45)]'
            : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 active:bg-white/[0.10]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
        ].join(' ')}
      >
        {children}
      </button>
    </RailTooltip>
  )
}

function RailDivider() {
  return (
    <div
      aria-hidden
      className="mx-1.5 h-px bg-white/[0.06]"
    />
  )
}

/* ───────────────────────── Rail bits ───────────────────────── */

function RailButton({
  children,
  label,
  hint,
  onClick,
  active,
}: {
  children: React.ReactNode
  label: string
  hint?: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <RailTooltip label={label} hint={hint}>
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={[
          'w-11 h-11 sm:w-9 sm:h-9',
          'group relative rounded-md flex items-center justify-center transition-all duration-150',
          active
            ? 'bg-skinny-yellow/[0.12] ring-1 ring-skinny-yellow/40 text-skinny-yellow'
            : 'text-zinc-300 hover:bg-white/[0.06] hover:text-skinny-yellow active:bg-white/[0.10]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
        ].join(' ')}
      >
        {children}
      </button>
    </RailTooltip>
  )
}

function RailTooltip({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            // Tooltip only renders on sm+ to avoid clipping at mobile rail position.
            className="pointer-events-none absolute z-50 hidden sm:flex items-center gap-2 left-[calc(100%+10px)] top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-zinc-900 ring-1 ring-white/[0.08] shadow-lg text-[11px] text-zinc-200"
          >
            {label}
            {hint && (
              <kbd className="px-1 py-px rounded bg-white/[0.06] ring-1 ring-white/[0.08] text-[10px] font-mono text-zinc-400">
                {hint}
              </kbd>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
