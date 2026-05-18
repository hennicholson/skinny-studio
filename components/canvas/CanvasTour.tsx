'use client'

// Three-step coachmark tour for the canvas. Owner mounts this (typically
// after the first node is added) and passes `open`. We measure target
// elements via querySelector and re-measure on resize/scroll so the
// spotlight and tooltip track the real DOM. If a target isn't found, the
// tooltip falls back to a centered floating card so the tour never breaks.
//
// Selectors used (kept resilient to refactors):
//   step 1 ("Add a node")  : [aria-label="Add node"]              (LeftRail)
//   step 2 ("Wire it up")  : .react-flow__handle (any handle pill on canvas)
//   step 3 ("Run it")      : button containing "Run all" text     (TopBar)

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

interface CanvasTourProps {
  open: boolean
  onDone: () => void
}

interface TourStep {
  id: string
  title: string
  body: string
  /** querySelector to spotlight. Function form lets step 3 do a text match. */
  resolve: () => Element | null
  /** Where to place the tooltip relative to the spotlight. */
  placement: 'right' | 'bottom' | 'left' | 'top'
}

const STEPS: TourStep[] = [
  {
    id: 'add',
    title: 'Add a node',
    body: 'Click the + in the left rail (or press /) to open the node palette. Pick a prompt, model, or output to drop onto the canvas.',
    resolve: () => document.querySelector('[aria-label="Add node"]'),
    placement: 'right',
  },
  {
    id: 'wire',
    title: 'Wire it up',
    body: 'Drag from a colored handle on one node to a handle on another. Colors match up — yellow for prompts, blue for images, purple for video.',
    resolve: () => document.querySelector('.react-flow__handle'),
    placement: 'right',
  },
  {
    id: 'run',
    title: 'Run it',
    body: 'When your graph is wired, hit Run all in the top bar. Each node lights up as it executes — outputs land on the Output node.',
    resolve: () => findButtonByText(['Run all', 'Run']),
    placement: 'bottom',
  },
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export function CanvasTour({ open, onDone }: CanvasTourProps) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const step = STEPS[index]

  const measure = useCallback(() => {
    if (!step) return
    const el = step.resolve()
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  // Reset to step 0 each time the tour reopens.
  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  // Re-measure on step change, mount, resize, and scroll. Use layout effect
  // so the spotlight appears in the same paint as the backdrop (no flash).
  useLayoutEffect(() => {
    if (!open) return
    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    // Re-measure on the next two frames in case the target mounts late
    // (e.g. handle pills appear once react-flow finishes measuring nodes).
    const t1 = requestAnimationFrame(measure)
    const t2 = setTimeout(measure, 120)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      cancelAnimationFrame(t1)
      clearTimeout(t2)
    }
  }, [open, index, measure])

  // Esc / Enter / Arrow shortcuts. Skip when the user is typing in an input
  // so we don't hijack form fields layered above the tour.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || t?.isContentEditable
      if (typing && e.key !== 'Escape') return

      if (e.key === 'Escape') {
        e.preventDefault()
        onDone()
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index])

  const next = useCallback(() => {
    if (index < STEPS.length - 1) setIndex(index + 1)
    else onDone()
  }, [index, onDone])

  const back = useCallback(() => {
    if (index > 0) setIndex(index - 1)
  }, [index])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[80] pointer-events-none"
        aria-live="polite"
        role="dialog"
        aria-label={`Canvas tour: ${step?.title ?? ''}`}
      >
        {/* Backdrop with SVG-mask spotlight cutout. Pointer-events-auto so
            users can't accidentally click through the tour. */}
        <SpotlightBackdrop rect={rect} onDismiss={onDone} />

        {/* Skip in the corner. */}
        <motion.button
          type="button"
          onClick={onDone}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-auto absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-1.5 h-10 sm:h-8 px-3.5 sm:px-3 rounded-md bg-white/[0.06] hover:bg-white/[0.1] ring-1 ring-white/[0.08] text-xs text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors"
          aria-label="Skip tour"
        >
          <X size={12} aria-hidden />
          Skip tour
        </motion.button>

        {/* Floating tooltip card. */}
        <TooltipCard
          step={step}
          rect={rect}
          index={index}
          total={STEPS.length}
          onBack={back}
          onNext={next}
        />
      </motion.div>
    </AnimatePresence>
  )
}

/* ───────────────────────── Backdrop ───────────────────────── */

function SpotlightBackdrop({ rect, onDismiss }: { rect: Rect | null; onDismiss: () => void }) {
  // Pad the cutout slightly so the highlighted element gets a halo.
  const PAD = 10
  const cutout = rect
    ? {
        top: Math.max(0, rect.top - PAD),
        left: Math.max(0, rect.left - PAD),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null

  return (
    <motion.div
      onClick={onDismiss}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 pointer-events-auto"
      style={{
        // Use a CSS mask so the cutout is a real transparent hole, not a
        // 4-div approximation. Works across modern browsers.
        background: 'rgba(0,0,0,0.62)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        // The radial mask cuts a fully-transparent rect; everything else
        // remains opaque. mask-composite excludes the rect from the fill.
        WebkitMaskImage: cutout
          ? `linear-gradient(#000, #000), linear-gradient(#000, #000)`
          : undefined,
        WebkitMaskClip: cutout ? 'padding-box, padding-box' : undefined,
        WebkitMaskComposite: cutout ? 'xor' : undefined,
        maskComposite: cutout ? 'exclude' : undefined,
      }}
    >
      {cutout && (
        <>
          {/* Glow ring around the spotlight target. */}
          <motion.div
            initial={false}
            animate={{
              top: cutout.top,
              left: cutout.left,
              width: cutout.width,
              height: cutout.height,
            }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="absolute rounded-xl pointer-events-none"
            style={{
              boxShadow:
                '0 0 0 9999px rgba(0,0,0,0.62), 0 0 0 2px rgba(214,252,81,0.55), 0 0 32px 4px rgba(214,252,81,0.25)',
            }}
          />
        </>
      )}
    </motion.div>
  )
}

/* ───────────────────────── Tooltip ───────────────────────── */

function TooltipCard({
  step,
  rect,
  index,
  total,
  onBack,
  onNext,
}: {
  step: TourStep | undefined
  rect: Rect | null
  index: number
  total: number
  onBack: () => void
  onNext: () => void
}) {
  const position = useMemo(() => placeTooltip(rect, step?.placement ?? 'right'), [rect, step?.placement])
  if (!step) return null

  const isLast = index === total - 1

  return (
    <motion.div
      key={step.id}
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 6 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={position}
      className="pointer-events-auto absolute w-[min(320px,calc(100vw-32px))] rounded-xl bg-zinc-950/95 backdrop-blur-md ring-1 ring-white/[0.08] shadow-2xl p-4"
    >
      {/* Step pip row */}
      <div className="flex items-center gap-1.5 mb-2">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${
              i === index ? 'w-6 bg-skinny-yellow' : 'w-1.5 bg-white/[0.12]'
            }`}
          />
        ))}
        <span className="ml-auto text-[10px] uppercase tracking-widest text-zinc-500">
          Step {index + 1} of {total}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-white">{step.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{step.body}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={index === 0}
          aria-label="Previous step"
          className="h-10 sm:h-8 px-3 sm:px-2 -ml-2 rounded-md text-[12px] sm:text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] disabled:opacity-0 disabled:cursor-default disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors"
        >
          Back
        </button>
        <motion.button
          type="button"
          onClick={onNext}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          aria-label={isLast ? 'Finish tour' : 'Next step'}
          className="h-10 sm:h-8 px-4 sm:px-3.5 rounded-md bg-skinny-yellow text-black text-xs font-semibold hover:bg-skinny-green transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
        >
          {isLast ? 'Got it' : 'Next'}
        </motion.button>
      </div>
    </motion.div>
  )
}

/* ───────────────────────── helpers ───────────────────────── */

function placeTooltip(
  rect: Rect | null,
  placement: TourStep['placement'],
): React.CSSProperties {
  const GAP = 16
  const TIP_W = 320
  const TIP_H = 160 // rough — actual height is content-driven
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768

  // No target: float center-screen.
  if (!rect) {
    return {
      top: `calc(50% - ${TIP_H / 2}px)`,
      left: `calc(50% - ${TIP_W / 2}px)`,
    }
  }

  let top = 0
  let left = 0
  switch (placement) {
    case 'right':
      top = rect.top + rect.height / 2 - TIP_H / 2
      left = rect.left + rect.width + GAP
      break
    case 'left':
      top = rect.top + rect.height / 2 - TIP_H / 2
      left = rect.left - TIP_W - GAP
      break
    case 'top':
      top = rect.top - TIP_H - GAP
      left = rect.left + rect.width / 2 - TIP_W / 2
      break
    case 'bottom':
    default:
      top = rect.top + rect.height + GAP
      left = rect.left + rect.width / 2 - TIP_W / 2
      break
  }
  // Clamp to viewport with a small margin.
  const M = 12
  top = Math.max(M, Math.min(top, vh - TIP_H - M))
  left = Math.max(M, Math.min(left, vw - TIP_W - M))
  return { top, left }
}

function findButtonByText(candidates: string[]): Element | null {
  if (typeof document === 'undefined') return null
  const buttons = Array.from(document.querySelectorAll('button'))
  for (const c of candidates) {
    const match = buttons.find((b) => (b.textContent || '').trim().includes(c))
    if (match) return match
  }
  return null
}
