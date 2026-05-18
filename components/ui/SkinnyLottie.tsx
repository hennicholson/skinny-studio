'use client'

// Tiny reusable Lottie player — for looping micro-animations only.
// SkinnyLogo and CanvasIntroSplash use their own bespoke players because
// they have specific lifecycle needs (replay every 10s, dismiss on
// complete). For everyday loading states + ambient loops, use this.
//
// Built-in variants point at the generated `/public/skinny-loader-*.json`
// files so callers don't have to remember the paths.

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type SkinnyLottieVariant =
  | 'drip'      // lime droplet falls + ripple (slow, contemplative)
  | 'wave'      // 3 vertical bars EQ-style (audio / generation)
  | 'orbit'     // 3 dots orbiting (async / processing)
  | 'pulse'     // soft lime ring breathing (Director thinking)

const VARIANT_PATHS: Record<SkinnyLottieVariant, string> = {
  drip: '/skinny-loader-drip.json',
  wave: '/skinny-loader-wave.json',
  orbit: '/skinny-loader-orbit.json',
  pulse: '/skinny-loader-pulse.json',
}

const VARIANT_ASPECT: Record<SkinnyLottieVariant, string> = {
  drip: '120 / 160',
  wave: '120 / 60',
  orbit: '120 / 120',
  pulse: '100 / 100',
}

export interface SkinnyLottieProps {
  variant: SkinnyLottieVariant
  /** Container className. Set width here; height comes from aspect-ratio. */
  className?: string
  /** Accessible label for the loading state. */
  ariaLabel?: string
}

export function SkinnyLottie({
  variant,
  className,
  ariaLabel = 'Loading',
}: SkinnyLottieProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    let cancelled = false
    let anim: any = null
    ;(async () => {
      try {
        const mod = await import('lottie-web')
        if (cancelled || !ref.current) return
        const lottie = mod.default || mod
        anim = lottie.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: VARIANT_PATHS[variant],
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
          },
        })
      } catch {
        // Silent — calling code already has its own visual context (a
        // skeleton card, a spinner spot). A failed Lottie just leaves an
        // empty space, which is acceptable.
      }
    })()
    return () => {
      cancelled = true
      if (anim) {
        try {
          anim.destroy()
        } catch {}
      }
    }
  }, [variant])

  return (
    <div
      ref={ref}
      className={cn('pointer-events-none select-none', className)}
      style={{ aspectRatio: VARIANT_ASPECT[variant] }}
      role="status"
      aria-label={ariaLabel}
    />
  )
}
