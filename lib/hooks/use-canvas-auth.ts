// Thin wrapper around useUser() tailored to the canvas routes. Centralizes:
//   - iframe detection (so we don't pop a login card inside a Whop embed)
//   - the "still loading" debounce that prevents a flash of unauth state
//   - a stable boolean trio (loading / authed / promptLogin) for callers
//
// Used by:
//   - app/canvas/page.tsx
//   - app/canvas/[id]/page.tsx
//   - components/canvas/AuthGate.tsx

'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/lib/context/user-context'
import { isInWhopIframe, resolveWhopAuth } from './use-whop-headers'

export interface CanvasAuthState {
  /** True while the initial /api/users/me round-trip is in flight. */
  loading: boolean
  /** True once we have a confirmed Whop profile. */
  authed: boolean
  /** True when we should render the AuthGate card (unauth + not in iframe). */
  promptLogin: boolean
  /** True when running inside the Whop iframe embed. */
  inIframe: boolean
  /** True when the user has lifetime access (free unlimited generations). */
  lifetime: boolean
}

export function useCanvasAuth(): CanvasAuthState {
  const { whop, profile, isLoading } = useUser()

  // SSR-safe iframe check — only meaningful client-side.
  const [inIframe, setInIframe] = useState(false)
  useEffect(() => {
    setInIframe(isInWhopIframe())
  }, [])

  const authed = !!whop
  const loading = isLoading && !authed

  // If we're inside the Whop iframe and still loading, we don't want to
  // show a login card — the parent frame is already authenticated and the
  // token should arrive momentarily via cookie/URL param. If after the
  // initial load we *still* have no token, we have no fallback (no /whop
  // OAuth available inside iframes), so we just keep the skeleton.
  const hasAnyToken = typeof window !== 'undefined' && !!resolveWhopAuth().token
  const promptLogin = !loading && !authed && !inIframe && !hasAnyToken

  const lifetime = !!profile?.lifetime_access

  return { loading, authed, promptLogin, inIframe, lifetime }
}
