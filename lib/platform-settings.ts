import { sbAdmin } from '@/lib/supabaseAdmin'

export interface OrchestrationSettings {
  enabled: boolean
  gemini_api_key: string | null
  default_orchestrator_model: string | null
  mode: 'platform_key' | 'user_keys'
}

// Cache for platform settings (refresh every 30 seconds)
let settingsCache: OrchestrationSettings | null = null
let cacheTimestamp = 0
const CACHE_TTL = 30 * 1000 // 30 seconds

/**
 * Get platform orchestration settings
 * Uses caching to avoid hitting the database on every request
 */
export async function getPlatformSettings(): Promise<OrchestrationSettings> {
  const now = Date.now()

  // Return cached settings if still valid
  if (settingsCache && now - cacheTimestamp < CACHE_TTL) {
    return settingsCache
  }

  try {
    const { data, error } = await sbAdmin
      .from('platform_settings')
      .select('value')
      .eq('key', 'orchestration')
      .single()

    if (error) {
      console.error('Error fetching platform settings:', error)
      // Return default settings on error
      return getDefaultSettings()
    }

    settingsCache = data.value as OrchestrationSettings
    cacheTimestamp = now

    return settingsCache
  } catch (error) {
    console.error('Error in getPlatformSettings:', error)
    return getDefaultSettings()
  }
}

/**
 * Get the Gemini API key to use based on platform settings
 * Returns platform key if enabled, otherwise returns null (use user key)
 */
export async function getGeminiApiKey(): Promise<string | null> {
  const settings = await getPlatformSettings()

  // If platform orchestration is enabled and has an API key, use it
  if (settings.enabled && settings.mode === 'platform_key' && settings.gemini_api_key) {
    return settings.gemini_api_key
  }

  // Return null to indicate user should provide their own key
  return null
}

/**
 * Get the effective Gemini API key, with fallback to env variable
 * @param userApiKey - Optional user-provided API key
 */
export async function getEffectiveGeminiApiKey(userApiKey?: string): Promise<string> {
  // First check platform settings
  const platformKey = await getGeminiApiKey()
  if (platformKey) {
    return platformKey
  }

  // Then check user-provided key
  if (userApiKey) {
    return userApiKey
  }

  // Finally fall back to environment variable
  const envKey = process.env.GOOGLE_AI_API_KEY
  if (!envKey) {
    throw new Error('No Gemini API key available: Platform key not set, user key not provided, and GOOGLE_AI_API_KEY not configured')
  }

  return envKey
}

/**
 * Check if platform orchestration mode is active
 */
export async function isPlatformOrchestrationActive(): Promise<boolean> {
  const settings = await getPlatformSettings()
  return settings.enabled && settings.mode === 'platform_key' && !!settings.gemini_api_key
}

/**
 * Invalidate the settings cache (call after admin updates)
 */
export function invalidatePlatformSettingsCache(): void {
  settingsCache = null
  cacheTimestamp = 0
}

function getDefaultSettings(): OrchestrationSettings {
  return {
    enabled: false,
    gemini_api_key: null,
    default_orchestrator_model: 'gemini-2.5-flash',
    mode: 'user_keys',
  }
}
