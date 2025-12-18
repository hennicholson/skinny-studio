// ============================================
// Local Storage Persistence Layer
// Ready for database migration
// ============================================

const STORAGE_VERSION = 1
const STORAGE_PREFIX = 'skinny_'

// Storage keys
export const STORAGE_KEYS = {
  GENERATIONS: `${STORAGE_PREFIX}generations`,
  WORKFLOWS: `${STORAGE_PREFIX}workflows`,
  SETTINGS: `${STORAGE_PREFIX}settings`,
  RECENT_MODELS: `${STORAGE_PREFIX}recent_models`,
  PLANNING_SESSIONS: `${STORAGE_PREFIX}planning_sessions`,
  CONVERSATIONS: `${STORAGE_PREFIX}conversations`,
  VERSION: `${STORAGE_PREFIX}version`,
} as const

// Check if we're in browser
const isBrowser = typeof window !== 'undefined'

/**
 * Save data to localStorage with quota handling
 */
export function saveToStorage<T>(key: string, data: T): void {
  if (!isBrowser) return

  try {
    const serialized = JSON.stringify(data)
    localStorage.setItem(key, serialized)
  } catch (error) {
    // Handle quota exceeded error
    if (error instanceof DOMException && (
      error.name === 'QuotaExceededError' ||
      error.code === 22 ||
      error.code === 1014
    )) {
      console.warn(`Storage quota exceeded for ${key}, attempting cleanup...`)

      // Try to clean up old data
      if (key === STORAGE_KEYS.CONVERSATIONS) {
        // For conversations, keep only the most recent 10
        if (Array.isArray(data)) {
          const trimmed = (data as unknown[]).slice(0, 10)
          try {
            localStorage.setItem(key, JSON.stringify(trimmed))
            console.log(`Trimmed ${key} to 10 items`)
            return
          } catch {
            // If still too large, keep only 5
            try {
              const minimal = (data as unknown[]).slice(0, 5)
              localStorage.setItem(key, JSON.stringify(minimal))
              console.log(`Trimmed ${key} to 5 items`)
              return
            } catch {
              // Give up and clear the storage for this key
              localStorage.removeItem(key)
              console.warn(`Cleared ${key} due to quota limits`)
              return
            }
          }
        }
      }

      // For other keys, try clearing old data
      try {
        // Remove least important data first
        localStorage.removeItem(STORAGE_KEYS.RECENT_MODELS)
        localStorage.removeItem(STORAGE_KEYS.PLANNING_SESSIONS)

        // Try again
        localStorage.setItem(key, JSON.stringify(data))
      } catch {
        console.error(`Unable to save ${key} even after cleanup`)
      }
    } else {
      console.error(`Error saving to storage (${key}):`, error)
    }
  }
}

/**
 * Load data from localStorage
 */
export function loadFromStorage<T>(key: string): T | null {
  if (!isBrowser) return null

  try {
    const serialized = localStorage.getItem(key)
    if (!serialized) return null

    const data = JSON.parse(serialized)

    // Handle date revival for known date fields
    return reviveDates(data) as T
  } catch (error) {
    console.error(`Error loading from storage (${key}):`, error)
    return null
  }
}

/**
 * Remove item from localStorage
 */
export function removeFromStorage(key: string): void {
  if (!isBrowser) return

  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error(`Error removing from storage (${key}):`, error)
  }
}

/**
 * Clear all Skinny Studio data from localStorage
 */
export function clearAllStorage(): void {
  if (!isBrowser) return

  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key)
  })
}

/**
 * Get storage version for migrations
 */
export function getStorageVersion(): number {
  if (!isBrowser) return STORAGE_VERSION

  const version = localStorage.getItem(STORAGE_KEYS.VERSION)
  return version ? parseInt(version, 10) : 0
}

/**
 * Set storage version after migrations
 */
export function setStorageVersion(version: number): void {
  if (!isBrowser) return
  localStorage.setItem(STORAGE_KEYS.VERSION, version.toString())
}

/**
 * Run migrations if needed
 */
export function migrateStorage(): void {
  if (!isBrowser) return

  const currentVersion = getStorageVersion()

  if (currentVersion < STORAGE_VERSION) {
    // Add migrations here as needed
    // Example:
    // if (currentVersion < 2) {
    //   migrateV1ToV2()
    // }

    setStorageVersion(STORAGE_VERSION)
  }
}

/**
 * Revive date strings to Date objects
 */
function reviveDates(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj

  if (typeof obj === 'string') {
    // Check if it's an ISO date string
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    if (dateRegex.test(obj)) {
      const date = new Date(obj)
      if (!isNaN(date.getTime())) {
        return date
      }
    }
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(reviveDates)
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = reviveDates(value)
    }
    return result
  }

  return obj
}

/**
 * Add item to recent models list
 */
export function addRecentModel(modelId: string): void {
  const recent = loadFromStorage<string[]>(STORAGE_KEYS.RECENT_MODELS) || []

  // Remove if already exists
  const filtered = recent.filter(id => id !== modelId)

  // Add to front
  filtered.unshift(modelId)

  // Keep only last 5
  const trimmed = filtered.slice(0, 5)

  saveToStorage(STORAGE_KEYS.RECENT_MODELS, trimmed)
}

/**
 * Get recent models list
 */
export function getRecentModels(): string[] {
  return loadFromStorage<string[]>(STORAGE_KEYS.RECENT_MODELS) || []
}

/**
 * Calculate storage usage
 */
export function getStorageUsage(): { used: number; available: number } {
  if (!isBrowser) return { used: 0, available: 0 }

  let used = 0

  Object.values(STORAGE_KEYS).forEach(key => {
    const item = localStorage.getItem(key)
    if (item) {
      used += item.length * 2 // UTF-16 characters
    }
  })

  // Most browsers allow 5-10MB
  const available = 5 * 1024 * 1024

  return { used, available }
}
