// Tiny first-run persistence helper. Backed by localStorage so the welcome
// overlay + tour only show once per browser without round-tripping a server.
// All reads are SSR-safe: they return `false` when window is unavailable so
// the empty-state can render predictably during a first paint.

const WELCOME_KEY = 'skinny-canvas-welcome-seen'
const TOUR_KEY = 'skinny-canvas-tour-seen'

function safeGet(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    // Some browsers (private mode, storage quota) throw on access. Treat as
    // "not seen" so the user gets the welcome rather than a silent failure.
    return false
  }
}

function safeSet(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Swallow — persistence is best-effort, not load-bearing.
  }
}

export function hasSeenWelcome(): boolean {
  return safeGet(WELCOME_KEY)
}

export function markWelcomeSeen(): void {
  safeSet(WELCOME_KEY)
}

export function hasSeenTour(): boolean {
  return safeGet(TOUR_KEY)
}

export function markTourSeen(): void {
  safeSet(TOUR_KEY)
}

// Exposed for tests or a future "reset onboarding" debug toggle.
export const FIRST_RUN_KEYS = {
  welcome: WELCOME_KEY,
  tour: TOUR_KEY,
} as const
