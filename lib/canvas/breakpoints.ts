'use client'

// Tiny breakpoint hook used by the canvas surfaces to make device-aware
// decisions (not just CSS reflow). Phone gets MobileViewer; tablet still
// gets MobileViewer with a denser 2-col layout; desktop gets the full
// CanvasShell node editor.
//
// Breakpoint contract — tuned for Whop iframe widths. The previous gate
// was `< 1024px`, which forced CanvasShell off for users on real desktops
// whose iframe wasn't full-width (Whop chrome takes 200-300px). Anyone
// genuinely on a desktop browser should see the full editor; only true
// phones get the read-only viewer.
//   phone   : viewport width  <  768px   (true handhelds)
//   tablet  : 768px <= width  < 1024px   (kept as a tier for callers that
//                                         want a denser MobileViewer, but
//                                         shellShouldRender now allows
//                                         CanvasShell at tablet too)
//   desktop : width >= 1024px
//
// The hook listens on matchMedia and updates on resize / orientation change.
// SSR-safe: returns 'desktop' until the first client render so we don't ship
// a phone-shaped tree to a tablet on first paint.

import { useEffect, useState } from 'react'

export type Breakpoint = 'phone' | 'tablet' | 'desktop'

const PHONE_QUERY = '(max-width: 767.98px)'
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023.98px)'

/**
 * Should the full CanvasShell node editor render at this breakpoint, or
 * should we route to MobileViewer? Threshold lowered from 'desktop only'
 * to 'tablet+' so the Whop iframe (often ~800-900px wide on real desktops)
 * gets the real editor. CanvasShell calls rfInstance.fitView() on mount so
 * the graph auto-zooms to fit narrower viewports gracefully.
 */
export function shellShouldRender(bp: Breakpoint): boolean {
  return bp !== 'phone'
}

function readBreakpoint(): Breakpoint {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'desktop'
  }
  if (window.matchMedia(PHONE_QUERY).matches) return 'phone'
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet'
  return 'desktop'
}

export function useBreakpoint(): Breakpoint {
  // Start at desktop on the server so the heavier editor doesn't flash a
  // mobile chrome before hydration. Real value is set in the effect.
  const [bp, setBp] = useState<Breakpoint>('desktop')

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const phoneMQ = window.matchMedia(PHONE_QUERY)
    const tabletMQ = window.matchMedia(TABLET_QUERY)

    const update = () => setBp(readBreakpoint())
    update()

    // matchMedia.addEventListener exists in all modern browsers; fall back to
    // addListener for older WebKit on iPad if needed.
    const addListener = (mq: MediaQueryList, cb: () => void) => {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', cb)
      } else if (typeof (mq as any).addListener === 'function') {
        ;(mq as any).addListener(cb)
      }
    }
    const removeListener = (mq: MediaQueryList, cb: () => void) => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', cb)
      } else if (typeof (mq as any).removeListener === 'function') {
        ;(mq as any).removeListener(cb)
      }
    }

    addListener(phoneMQ, update)
    addListener(tabletMQ, update)
    return () => {
      removeListener(phoneMQ, update)
      removeListener(tabletMQ, update)
    }
  }, [])

  return bp
}

// Static helper for non-React call sites (e.g. inside event handlers that
// fire after a re-render has already settled). Returns 'desktop' under SSR.
export function getBreakpoint(): Breakpoint {
  return readBreakpoint()
}
