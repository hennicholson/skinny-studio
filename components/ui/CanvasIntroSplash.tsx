'use client'

// "Introducing Skinny CANVAS" — full-viewport intro Lottie splash that
// plays once per release on the user's first visit to canvas mode. Marks
// itself seen in localStorage when the animation completes (or the user
// dismisses), so subsequent canvas visits skip it.
//
// Design constraints:
//   - GPU-accelerated. The Lottie SVG renderer composites on its own layer.
//   - Dismissible: click anywhere, press Esc, or wait for it to finish.
//   - Respects prefers-reduced-motion: skips entirely.
//   - Gated by RELEASE_VERSION so a new launch / banner moment can re-fire.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

// Bump this string when you want the intro to re-play for users who already
// saw the previous version (e.g. fresh feature launch, refreshed messaging).
const INTRO_RELEASE_KEY = 'skinny:canvas-intro:v1'
const ANIMATION_PATH = '/skinny-canvas-intro.json'
// Animation is 572 frames at 60fps = 9.53s; fade out after it lands +
// briefly hold so the final "LIVE NOW" frame breathes before clearing.
const ANIMATION_DURATION_MS = 9_530
const HOLD_AFTER_COMPLETE_MS = 600

interface CanvasIntroSplashProps {
  /** Force-disable from the parent (e.g. demo route, embed). */
  enabled?: boolean
}

export function CanvasIntroSplash({ enabled = true }: CanvasIntroSplashProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const animRef = useRef<any>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // First-paint gate — only show if we haven't shown this release yet AND
  // the user hasn't asked the OS for reduced motion.
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    try {
      if (window.localStorage.getItem(INTRO_RELEASE_KEY) === '1') return
    } catch {
      // private mode etc — just show it once per session
    }
    setOpen(true)
    setMounted(true)
  }, [enabled])

  // Auto-dismiss after the animation completes + brief hold.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(
      () => dismiss(),
      ANIMATION_DURATION_MS + HOLD_AFTER_COMPLETE_MS,
    )
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Esc to skip.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Load Lottie when the overlay mounts. Same dynamic-import pattern as
  // SkinnyLogo — keeps lottie-web out of the initial bundle.
  useEffect(() => {
    if (!open || !containerRef.current) return
    let cancelled = false
    let anim: any = null
    ;(async () => {
      try {
        const mod = await import('lottie-web')
        if (cancelled || !containerRef.current) return
        const lottie = mod.default || mod
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          path: ANIMATION_PATH,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
          },
        })
        animRef.current = anim
      } catch (err) {
        // If lottie fails to load, silently bail — don't block the user
        // with a broken splash. Mark seen so we don't try again.
        // eslint-disable-next-line no-console
        console.warn('[CanvasIntroSplash] lottie failed, skipping:', err)
        dismiss()
      }
    })()
    return () => {
      cancelled = true
      if (anim) {
        try {
          anim.destroy()
        } catch {}
      }
      animRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const dismiss = () => {
    setOpen(false)
    try {
      window.localStorage.setItem(INTRO_RELEASE_KEY, '1')
    } catch {
      // ignore
    }
  }

  if (!mounted) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black"
          onClick={dismiss}
          role="dialog"
          aria-label="Welcome to Skinny Canvas"
        >
          {/* Lottie stage — capped width so wide hero animations don't
              stretch beyond pleasant size on ultra-wide monitors. */}
          <div
            ref={containerRef}
            className="w-[min(92vw,1100px)] aspect-[1721/960] pointer-events-none"
            aria-hidden
          />

          {/* Skip affordance — bottom-right, low-key but discoverable.
              Pointer events bubble up to the backdrop on click. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              dismiss()
            }}
            className="absolute bottom-6 right-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-medium text-white/60 hover:text-white/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50"
            aria-label="Skip intro"
          >
            <X size={11} />
            skip
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
