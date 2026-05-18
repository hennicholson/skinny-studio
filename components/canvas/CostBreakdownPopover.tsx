'use client'

// Pure-presentation popover showing the canvas's per-node cost breakdown.
// The consumer is responsible for open/close state and positioning context
// (pass `anchorRef` to anchor under a cost chip; we measure its rect to
// position the popover). On viewports below the `sm` breakpoint we render
// a full-screen modal sheet instead so it stays tappable on phones.

import { useEffect, useLayoutEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Receipt } from 'lucide-react'
import type { Canvas } from '@/lib/canvas/ir'
import { formatCents } from '@/lib/canvas/cost'
import {
  breakdownCanvas,
  NodeCostRow,
} from '@/lib/canvas/cost-breakdown'
import type { StudioModel } from '@/lib/canvas/cost'

interface CostBreakdownPopoverProps {
  open: boolean
  onClose: () => void
  canvas: Canvas
  models: Map<string, StudioModel>
  /** When provided, anchors the desktop popover under this element. */
  anchorRef?: React.RefObject<HTMLElement>
}

interface AnchorRect {
  top: number
  right: number
  bottom: number
  width: number
}

function useAnchorRect(anchorRef?: React.RefObject<HTMLElement>, open?: boolean): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) {
      setRect(null)
      return
    }

    const measure = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, right: r.right, bottom: r.bottom, width: r.width })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchorRef, open])

  return rect
}

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

function Row({ row }: { row: NodeCostRow }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 text-sm border-b border-white/[0.04] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-zinc-200 truncate">{row.label}</div>
        {row.note && (
          <div className="text-[11px] text-zinc-500 truncate">{row.note}</div>
        )}
      </div>
      <div className="text-zinc-300 tabular-nums shrink-0">
        {formatCents(row.costCents)}
      </div>
    </div>
  )
}

function BreakdownBody({ rows, total }: { rows: NodeCostRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-zinc-500">
        Add a model node to estimate cost.
      </div>
    )
  }

  return (
    <>
      <div className="max-h-[60vh] overflow-y-auto">
        {rows.map((row) => (
          <Row key={row.nodeId} row={row} />
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-white/[0.06] bg-white/[0.02]">
        <span className="text-xs uppercase tracking-wider text-zinc-500">
          Estimated total
        </span>
        <span className="text-sm font-medium text-skinny-lime tabular-nums">
          {formatCents(total)}
        </span>
      </div>
    </>
  )
}

export function CostBreakdownPopover({
  open,
  onClose,
  canvas,
  models,
  anchorRef,
}: CostBreakdownPopoverProps) {
  const rect = useAnchorRect(anchorRef, open)
  useEscapeToClose(open, onClose)

  // Compute once per render; cheap. Could memo if canvas gets very large.
  const rows = open ? breakdownCanvas(canvas, models) : []
  const total = rows.reduce((sum, r) => sum + r.costCents, 0)

  // Position the desktop popover under the anchor. Right-aligned to the
  // anchor's right edge with an 8px gap below. Clamped to the viewport.
  const POPOVER_W = 320
  const desktopStyle: React.CSSProperties = rect
    ? {
        top: rect.bottom + 8,
        left: Math.max(
          8,
          Math.min(rect.right - POPOVER_W, window.innerWidth - POPOVER_W - 8),
        ),
        width: POPOVER_W,
      }
    : { top: 64, right: 16, width: POPOVER_W }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — captures outside clicks. Transparent on desktop,
              subtle scrim on mobile (the popover becomes a sheet). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent"
            onClick={onClose}
          />

          {/* Mobile: full-screen sheet from bottom. */}
          <motion.div
            key="mobile"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 sm:hidden rounded-t-2xl bg-zinc-950 border-t border-white/[0.06] shadow-2xl max-h-[85vh] flex flex-col"
            role="dialog"
            aria-label="Cost breakdown"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-zinc-200">
                <Receipt size={15} className="text-skinny-lime" />
                <span className="text-sm font-medium">Cost breakdown</span>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={16} className="text-zinc-400" />
              </button>
            </div>
            <BreakdownBody rows={rows} total={total} />
          </motion.div>

          {/* Desktop: anchored popover. */}
          <motion.div
            key="desktop"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="hidden sm:flex fixed z-50 flex-col rounded-xl bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl overflow-hidden"
            style={desktopStyle}
            role="dialog"
            aria-label="Cost breakdown"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-zinc-300">
                <Receipt size={13} className="text-skinny-lime" />
                <span className="text-xs uppercase tracking-wider">Cost breakdown</span>
              </div>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded hover:bg-white/[0.06] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={12} className="text-zinc-500" />
              </button>
            </div>
            <BreakdownBody rows={rows} total={total} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
