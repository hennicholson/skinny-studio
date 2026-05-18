'use client'

// Floating bottom-center toolbar — matches Runway's tool dock.
// select / marquee · zoom in / zoom out / fit · zoom % · undo / redo
// On phones it docks to the bottom-center w/ safe-area padding.
// Last-used tool persists in localStorage; Tab cycles tools.

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import {
  MousePointer2,
  SquareDashed,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useReactFlow, useStore } from '@xyflow/react'

type Tool = 'select' | 'marquee'

const STORAGE_KEY = 'skinny:canvas:tool'

interface BottomToolbarProps {
  tool: Tool
  setTool: (t: Tool) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

export function BottomToolbar({
  tool,
  setTool,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: BottomToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  // Read live zoom from the react-flow store so the % updates in real-time
  // without a manual onMove subscription.
  const zoom = useStore((s) => s.transform[2])

  // ── Persistence ── load last-used tool once on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'select' || saved === 'marquee') {
        if (saved !== tool) setTool(saved)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Write whenever the tool changes (callers are the source of truth).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, tool)
    } catch {}
  }, [tool])

  // ── Keyboard: Tab cycles, S = select, M = marquee.
  // Skip when typing in any input/textarea/contenteditable.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Tab') {
        e.preventDefault()
        setTool(tool === 'select' ? 'marquee' : 'select')
        return
      }
      if (e.key === 's' || e.key === 'S') setTool('select')
      if (e.key === 'm' || e.key === 'M') setTool('marquee')
    },
    [tool, setTool],
  )
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 26 }}
      className={[
        // z-50 so the toolbar floats ABOVE the Director chat panel (z-40)
        // when it slides in from the right. Previous z-30 was getting
        // covered by the panel, which both hid the toolbar AND made it
        // look off-center because only the left half was visible behind
        // the panel's edge.
        'absolute z-50 flex items-center gap-0.5',
        'bg-zinc-950/95 backdrop-blur-md ring-1 ring-white/[0.08] rounded-xl px-1.5 py-1 shadow-2xl',
        // Bottom-center on every viewport; on phones we honor the safe area.
        'left-1/2 -translate-x-1/2',
        'bottom-[calc(env(safe-area-inset-bottom)+16px)] sm:bottom-6',
      ].join(' ')}
    >
      <ToolBtn
        active={tool === 'select'}
        onClick={() => setTool('select')}
        label="Select"
        hint="S"
        Icon={MousePointer2}
      />
      <ToolBtn
        active={tool === 'marquee'}
        onClick={() => setTool('marquee')}
        label="Marquee"
        hint="M"
        Icon={SquareDashed}
      />
      <Divider />
      <ToolBtn
        onClick={() => zoomOut({ duration: 200 })}
        label="Zoom out"
        hint="−"
        Icon={ZoomOut}
      />
      <ZoomReadout
        zoom={zoom}
        onClick={() => fitView({ duration: 300, padding: 0.2 })}
      />
      <ToolBtn
        onClick={() => zoomIn({ duration: 200 })}
        label="Zoom in"
        hint="+"
        Icon={ZoomIn}
      />
      <ToolBtn
        onClick={() => fitView({ duration: 300, padding: 0.2 })}
        label="Fit view"
        hint="F"
        Icon={Maximize2}
      />
      <Divider />
      <ToolBtn
        onClick={onUndo}
        disabled={!canUndo}
        label="Undo"
        hint="⌘Z"
        Icon={Undo2}
      />
      <ToolBtn
        onClick={onRedo}
        disabled={!canRedo}
        label="Redo"
        hint="⇧⌘Z"
        Icon={Redo2}
      />
    </motion.div>
  )
}

/* ───────────────────────── Zoom readout ───────────────────────── */

function ZoomReadout({ zoom, onClick }: { zoom: number; onClick: () => void }) {
  const pct = Math.round((zoom ?? 1) * 100)
  return (
    <DockTooltip label="Reset zoom" hint="⇧1">
      <button
        onClick={onClick}
        aria-label={`Reset zoom (currently ${pct}%)`}
        className="relative h-8 px-1.5 min-w-[42px] rounded-lg text-[11px] font-mono text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100 transition-colors tabular-nums after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50"
      >
        {pct}%
      </button>
    </DockTooltip>
  )
}

/* ───────────────────────── Tool button ───────────────────────── */

function ToolBtn({
  Icon,
  onClick,
  active,
  disabled,
  label,
  hint,
}: {
  Icon: any
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  label: string
  hint?: string
}) {
  return (
    <DockTooltip label={label} hint={hint} disabled={disabled}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        // Vertical hit-area expansion via pseudo (-inset-y-1.5) so a fingertip
        // doesn't have to land precisely on a 32px chip. Horizontal stays flush
        // because adjacent buttons would steal each other's hit area otherwise.
        // Net tap zone: 32×44 — meets touch-target guidance for a dense dock.
        className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-all after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] sm:after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 ${
          disabled
            ? 'opacity-30 cursor-not-allowed'
            : active
            ? 'bg-white text-zinc-900 shadow-sm'
            : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'
        }`}
      >
        <Icon size={13} strokeWidth={2} />
      </button>
    </DockTooltip>
  )
}

function Divider() {
  return <span className="w-px h-5 bg-white/[0.06] mx-0.5" />
}

/* ───────────────────────── Tooltip (mirrors rail style) ───────────────────────── */

function DockTooltip({
  label,
  hint,
  disabled,
  children,
}: {
  label: string
  hint?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => !disabled && setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => !disabled && setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-50 flex items-center gap-2 bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-zinc-900 ring-1 ring-white/[0.08] shadow-lg text-[11px] text-zinc-200"
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
