'use client'

// SkinnyLogo — animated wordmark backed by Lottie, with graceful fallback to
// the static SVG when:
//   - lottie-web fails to load (network / iframe sandbox / etc.)
//   - the user prefers reduced motion
//   - we're rendering in `mode="static"` chrome contexts (small headers etc.)
//
// Two modes:
//   - mode="hero"   : full draw-in + liquid-fill animation on mount, then
//                     replays every 10s. Used on chat welcome + canvas landing
//                     hero placements where the wordmark is the focal element.
//   - mode="static" : freezes on the final frame. Used in TopBar, AuthGate,
//                     MobileViewer, preview header — places where a looping
//                     animation would compete for attention.
//
// The Lottie JSON lives at /public/skinny-logo.json (208 frames @ 60fps,
// native aspect ratio 1721:505). Component preserves that aspect by default;
// callers control sizing via className width and height auto.

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

const ANIMATION_PATH = '/skinny-logo.json'
const STATIC_FALLBACK = '/skinny-logo.svg'
// Native aspect of the Lottie comp (1721 × 505). Used so callers can size by
// width and we just compute the height — and so the SVG fallback matches
// dimensions without a layout shift on load.
export const SKINNY_LOGO_ASPECT = '1721 / 505'
const REPLAY_INTERVAL_MS = 10_000

export interface SkinnyLogoProps {
  /** 'hero' replays the draw-in every 10s; 'static' freezes on final frame. */
  mode?: 'hero' | 'static'
  /** Outer wrapper className. Set width here; height comes from aspect-ratio. */
  className?: string
  /** Alt text for screen readers / fallback img. */
  alt?: string
  /** Force the static SVG fallback even when Lottie would work. Useful for
      tiny chrome usages where a 30KB JSON parse isn't worth the trip. */
  forceStatic?: boolean
}

export function SkinnyLogo({
  mode = 'hero',
  className,
  alt = 'Skinny Studio',
  forceStatic = false,
}: SkinnyLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<any>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [failed, setFailed] = useState(false)

  // Respect reduced-motion. Caller can override with mode='hero' but if the
  // user explicitly opted out at the OS level, we honor that — show static.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
  }, [])

  const useStaticSvg = forceStatic || failed
  const shouldAnimate = mode === 'hero' && !prefersReducedMotion && !useStaticSvg

  useEffect(() => {
    if (useStaticSvg) return
    if (!containerRef.current) return

    let cancelled = false
    let anim: any = null
    ;(async () => {
      try {
        // Dynamic import — keeps the ~250KB lottie-web bundle out of the
        // initial page payload. Loaded once per page; cached afterwards.
        const mod = await import('lottie-web')
        if (cancelled || !containerRef.current) return
        const lottie = mod.default || mod
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: false,
          autoplay: shouldAnimate,
          path: ANIMATION_PATH,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
          },
        })
        animRef.current = anim

        // Static mode: jump to the last frame so the wordmark sits at rest.
        if (!shouldAnimate) {
          anim.addEventListener('data_ready', () => {
            try {
              anim.goToAndStop(anim.totalFrames - 1, true)
            } catch {
              // ignore — frame jump is cosmetic
            }
          })
        }

        // Hero mode: replay every 10 seconds. We stop the auto-loop and
        // schedule restarts so each playback is a deliberate "ping" rather
        // than a continuous loop.
        if (shouldAnimate) {
          intervalRef.current = setInterval(() => {
            if (!animRef.current) return
            try {
              animRef.current.goToAndPlay(0, true)
            } catch {
              // ignore — animation will catch up on the next interval tick
            }
          }, REPLAY_INTERVAL_MS)
        }
      } catch (err) {
        // Network, sandbox, or parse error → fall back to the SVG. We never
        // want the logo to disappear because the animation failed to load.
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[SkinnyLogo] Lottie failed, falling back to SVG:', err)
          setFailed(true)
        }
      }
    })()

    return () => {
      cancelled = true
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (anim) {
        try {
          anim.destroy()
        } catch {
          // ignore
        }
      }
      animRef.current = null
    }
  }, [useStaticSvg, shouldAnimate])

  if (useStaticSvg) {
    return (
      <div
        className={cn('relative', className)}
        style={{ aspectRatio: SKINNY_LOGO_ASPECT }}
        role="img"
        aria-label={alt}
      >
        <Image
          src={STATIC_FALLBACK}
          alt={alt}
          fill
          sizes="(max-width: 768px) 200px, 400px"
          priority
          className="object-contain"
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      style={{ aspectRatio: SKINNY_LOGO_ASPECT }}
      role="img"
      aria-label={alt}
    />
  )
}
