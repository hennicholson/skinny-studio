// Shared client-side helper for forwarding the Whop dev token + user id to
// API routes. Matches the pattern used throughout the existing codebase
// (chat-input.tsx, library-view.tsx, etc.) — single source so future auth
// changes touch one file.
//
// Iframe-aware: when running inside the Whop iframe, Whop injects the dev
// token via the `whop-dev-user-token` URL query param on first load and the
// `/whop` entry route persists it to localStorage. In production embedded
// mode, the platform also sets the `whop-user-token` cookie on the iframe
// origin which is sent automatically with `credentials: 'include'` fetches.
//
// This hook unifies all three sources:
//   1. URL query param (`whop-dev-user-token`) — captured on first paint
//   2. localStorage (`whop-dev-token`, `whop-dev-user-id`) — persistent
//   3. cookie (`whop-user-token`) — set by the Whop iframe host in prod
//
// Standalone dev (`localhost:3007`) falls through to localStorage only.

'use client'

import { useCallback } from 'react'

/** True when the current window is rendered inside an iframe (Whop embed). */
export function isInWhopIframe(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin frame access throws — that itself means we're framed.
    return true
  }
}

/** Read a cookie by name from the current document. */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
}

/** Read the URL search params token (Whop iframe handshake). */
function readUrlToken(): { token: string | null; userId: string | null } {
  if (typeof window === 'undefined') return { token: null, userId: null }
  try {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('whop-dev-user-token')
    let userId: string | null = null
    if (token) {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          userId = payload.sub || payload.user_id || payload.id || null
        }
      } catch {
        // ignore decode errors
      }
    }
    return { token, userId }
  } catch {
    return { token: null, userId: null }
  }
}

/**
 * Resolve the best-available Whop auth token + user id, checking iframe
 * sources first (URL param, cookies) and falling back to localStorage.
 *
 * Exported so non-hook callers (e.g. AuthGate) can check for credentials
 * without forcing a re-render via useCallback.
 */
export function resolveWhopAuth(): {
  token: string | null
  userId: string | null
  source: 'url' | 'cookie' | 'localStorage' | null
} {
  if (typeof window === 'undefined') return { token: null, userId: null, source: null }

  // 1. URL query param (Whop iframe handshake) takes precedence — it's the
  //    freshest signal and will only be present on the first load after a
  //    Whop redirect.
  const url = readUrlToken()
  if (url.token) {
    // Persist to localStorage so subsequent hook calls see it without a
    // re-render path. Mirrors what /app/whop/page.tsx does.
    try {
      localStorage.setItem('whop-dev-token', url.token)
      if (url.userId) localStorage.setItem('whop-dev-user-id', url.userId)
    } catch {
      // localStorage may be blocked in incognito-frame contexts
    }
    return { token: url.token, userId: url.userId, source: 'url' }
  }

  // 2. Cookie (set by Whop host in production iframe).
  const cookieToken = readCookie('whop-user-token') || readCookie('whop_user_token')
  if (cookieToken) {
    let userId: string | null = null
    try {
      const parts = cookieToken.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]))
        userId = payload.sub || payload.user_id || payload.id || null
      }
    } catch {
      // ignore decode errors
    }
    return { token: cookieToken, userId, source: 'cookie' }
  }

  // 3. localStorage (standalone dev or persisted from prior iframe load).
  try {
    const token = localStorage.getItem('whop-dev-token')
    const userId = localStorage.getItem('whop-dev-user-id')
    if (token) return { token, userId, source: 'localStorage' }
  } catch {
    // localStorage unavailable
  }

  return { token: null, userId: null, source: null }
}

export function useWhopHeaders(): () => Record<string, string> {
  return useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const { token, userId } = resolveWhopAuth()
    if (token) headers['x-whop-user-token'] = token
    if (userId) headers['x-whop-user-id'] = userId
    return headers
  }, [])
}
