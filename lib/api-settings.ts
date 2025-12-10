'use client'

// Available orchestrator models
export interface OrchestratorModel {
  id: string
  name: string
  provider: 'google' | 'google-vertex'
  description: string
  limits: {
    rpm: number | 'unlimited'
    tpm: number | 'unlimited'
    rpd: number | 'unlimited'
  }
  tier: 'free' | 'paid'
  supportsVoice?: boolean
  isLiveApi?: boolean
}

export const ORCHESTRATOR_MODELS: OrchestratorModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Latest and most capable, best for complex creative direction',
    limits: { rpm: 10, tpm: 250000, rpd: 500 },
    tier: 'free',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    description: 'Fast and capable, good balance of speed and quality',
    limits: { rpm: 15, tpm: 1000000, rpd: 1500 },
    tier: 'free',
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    provider: 'google',
    description: 'Lightweight and fast, great for quick responses',
    limits: { rpm: 30, tpm: 1000000, rpd: 1500 },
    tier: 'free',
  },
  {
    id: 'gemma-3-12b-it',
    name: 'Gemma 3 12B',
    provider: 'google',
    description: 'Efficient open model, great balance of speed and capability',
    limits: { rpm: 30, tpm: 15000, rpd: 14400 },
    tier: 'free',
  },
  {
    id: 'gemma-3-27b-it',
    name: 'Gemma 3 27B',
    provider: 'google',
    description: 'Larger open model, better for complex tasks',
    limits: { rpm: 30, tpm: 15000, rpd: 14400 },
    tier: 'free',
  },
]

// Voice-enabled models using Gemini Live API
// Uses WebSocket for real-time bidirectional audio streaming
// Audio specs: Input 16-bit PCM, 16kHz mono / Output 24kHz
export const VOICE_MODELS: OrchestratorModel[] = [
  {
    id: 'gemini-2.5-flash-preview-native-audio-dialog',
    name: 'Gemini 2.5 Flash Live',
    provider: 'google',
    description: 'Real-time voice conversations via Live API (WebSocket)',
    limits: { rpm: 'unlimited', tpm: 1000000, rpd: 'unlimited' },
    tier: 'free',
    supportsVoice: true,
    isLiveApi: true,
  },
]

const STORAGE_KEY = 'skinny_api_settings'

export interface ApiSettings {
  googleApiKey: string
  selectedModelId: string
  voiceEnabled: boolean
}

const DEFAULT_SETTINGS: ApiSettings = {
  googleApiKey: '',
  selectedModelId: 'gemma-3-12b-it',
  voiceEnabled: false,
}

export function getApiSettings(): ApiSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.error('Failed to load API settings:', e)
  }

  return DEFAULT_SETTINGS
}

export function saveApiSettings(settings: Partial<ApiSettings>): void {
  if (typeof window === 'undefined') return

  try {
    const current = getApiSettings()
    const updated = { ...current, ...settings }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to save API settings:', e)
  }
}

export function getSelectedModel(): OrchestratorModel {
  const settings = getApiSettings()
  return ORCHESTRATOR_MODELS.find(m => m.id === settings.selectedModelId) || ORCHESTRATOR_MODELS.find(m => m.id === 'gemma-3-12b-it') || ORCHESTRATOR_MODELS[0]
}

export function hasApiKey(): boolean {
  const settings = getApiSettings()
  return Boolean(settings.googleApiKey)
}

// Models that support vision/image input
const VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]

export function selectedModelSupportsVision(): boolean {
  const settings = getApiSettings()
  return VISION_MODELS.includes(settings.selectedModelId)
}
