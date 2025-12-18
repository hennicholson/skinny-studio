/**
 * Simple in-memory rate limiter
 * For production scale, consider using Redis (Upstash) instead
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  reset: number
  limit: number
}

// In-memory store - resets on server restart
const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return

  lastCleanup = now
  // Use Array.from for ES5 compatibility
  Array.from(store.entries()).forEach(([key, entry]) => {
    if (entry.resetAt < now) {
      store.delete(key)
    }
  })
}

/**
 * Check and update rate limit for a given key
 * @param key - Unique identifier (usually IP or user ID)
 * @param limit - Max requests allowed in window
 * @param windowMs - Time window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  cleanup()

  const now = Date.now()
  const entry = store.get(key)

  // No existing entry or window expired - create new
  if (!entry || entry.resetAt < now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs
    })
    return {
      success: true,
      remaining: limit - 1,
      reset: now + windowMs,
      limit
    }
  }

  // Within window - check limit
  if (entry.count >= limit) {
    return {
      success: false,
      remaining: 0,
      reset: entry.resetAt,
      limit
    }
  }

  // Increment and allow
  entry.count++
  return {
    success: true,
    remaining: limit - entry.count,
    reset: entry.resetAt,
    limit
  }
}

/**
 * Generate a rate limit key from request
 * Uses user ID if available, falls back to IP
 */
export function getRateLimitKey(request: Request, userId?: string | null, prefix = 'rl'): string {
  if (userId) {
    return `${prefix}:user:${userId}`
  }

  // Try to get IP from various headers
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')

  const ip = cfIp || realIp || forwarded?.split(',')[0]?.trim() || 'unknown'
  return `${prefix}:ip:${ip}`
}

/**
 * Preset rate limit configurations
 */
export const RATE_LIMITS = {
  // Generation: 10 per minute (expensive operation)
  generate: { limit: 10, windowMs: 60 * 1000 },

  // Upload: 20 per minute
  upload: { limit: 20, windowMs: 60 * 1000 },

  // Chat: 30 per minute
  chat: { limit: 30, windowMs: 60 * 1000 },

  // Webhooks: 100 per minute (called by external services)
  webhook: { limit: 100, windowMs: 60 * 1000 },

  // General API: 60 per minute
  api: { limit: 60, windowMs: 60 * 1000 },
} as const
