'use client'

import { useEffect, useState } from 'react'
import {
  Settings,
  Key,
  ToggleLeft,
  ToggleRight,
  Save,
  Loader2,
  Shield,
  AlertCircle,
  Check,
  Server,
  Users,
  Eye,
  EyeOff,
  Sparkles,
  Brain,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'
import { ORCHESTRATOR_MODELS } from '@/lib/api-settings'

interface PlatformSettings {
  enabled: boolean
  gemini_api_key_masked: string | null
  has_api_key: boolean
  default_orchestrator_model: string | null
  mode: 'platform_key' | 'user_keys'
}

export default function PlatformPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<'platform_key' | 'user_keys'>('user_keys')
  const [newApiKey, setNewApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash')

  const fetchSettings = async () => {
    try {
      const response = await adminFetch('/api/admin/platform')
      if (response.ok) {
        const data = await response.json()
        setSettings(data.settings)
        setEnabled(data.settings.enabled)
        setMode(data.settings.mode)
        setSelectedModel(data.settings.default_orchestrator_model || 'gemini-2.5-flash')
      } else {
        setError('Failed to load settings')
      }
    } catch (err) {
      console.error('Error fetching settings:', err)
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const body: Record<string, any> = {
        enabled,
        mode,
        default_orchestrator_model: selectedModel,
      }

      // Only include API key if a new one was entered
      if (newApiKey.trim()) {
        body.gemini_api_key = newApiKey.trim()
      }

      const response = await adminFetch('/api/admin/platform', {
        method: 'PUT',
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const data = await response.json()
        setSettings(data.settings)
        setNewApiKey('')
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to save settings')
      }
    } catch (err) {
      console.error('Error saving settings:', err)
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-40 bg-zinc-800 rounded" />
          <div className="h-40 bg-zinc-800 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 min-h-screen overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
          <Brain className="text-skinny-yellow" size={24} />
          Platform Orchestration
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Control the AI orchestrator (Gemini) for all users on the platform
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
          <AlertCircle className="text-red-400 flex-shrink-0" size={18} />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Success Alert */}
      {saved && (
        <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
          <Check className="text-green-400 flex-shrink-0" size={18} />
          <p className="text-sm text-green-400">Settings saved successfully!</p>
        </div>
      )}

      <div className="space-y-6 max-w-2xl">
        {/* Orchestration Mode Card */}
        <div className="bg-zinc-950 border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <Shield className="text-skinny-yellow" size={18} />
                  Platform Orchestration Mode
                </h2>
                <p className="text-sm text-white/50 mt-1">
                  When enabled, all users will use your platform Gemini API key for the AI orchestrator
                </p>
              </div>
              <button
                onClick={() => setEnabled(!enabled)}
                className="flex-shrink-0 ml-4"
              >
                {enabled ? (
                  <ToggleRight size={40} className="text-skinny-green" />
                ) : (
                  <ToggleLeft size={40} className="text-white/30" />
                )}
              </button>
            </div>

            {/* Status Indicator */}
            <div className={cn(
              'mt-4 p-3 rounded-lg flex items-center gap-3',
              enabled
                ? 'bg-skinny-green/10 border border-skinny-green/20'
                : 'bg-zinc-900 border border-white/[0.04]'
            )}>
              {enabled ? (
                <>
                  <Server className="text-skinny-green" size={16} />
                  <span className="text-sm text-skinny-green font-medium">
                    Platform Mode Active - All users use your Gemini API key
                  </span>
                </>
              ) : (
                <>
                  <Users className="text-white/40" size={16} />
                  <span className="text-sm text-white/40">
                    User Mode - Each user provides their own API key in Settings
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* API Key Card */}
        <div className={cn(
          'bg-zinc-950 border border-white/[0.06] rounded-xl overflow-hidden transition-opacity',
          !enabled && 'opacity-50'
        )}>
          <div className="p-6">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Key className="text-skinny-yellow" size={18} />
              Google AI (Gemini) API Key
            </h2>
            <p className="text-sm text-white/50 mt-1">
              This key powers the AI Creative Director for all users when platform mode is enabled
            </p>

            {/* Current Key Status */}
            {settings?.has_api_key && (
              <div className="mt-4 p-3 rounded-lg bg-zinc-900 border border-white/[0.04] flex items-center gap-3">
                <Check className="text-green-400 flex-shrink-0" size={16} />
                <div className="flex-1">
                  <span className="text-sm text-white/60">Current key: </span>
                  <span className="text-sm text-white font-mono">
                    {settings.gemini_api_key_masked}
                  </span>
                </div>
              </div>
            )}

            {/* New API Key Input */}
            <div className="mt-4">
              <label className="block text-sm text-white/50 mb-2">
                {settings?.has_api_key ? 'Update API Key (leave blank to keep current)' : 'Enter API Key'}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  disabled={!enabled}
                  className="w-full px-4 py-3 pr-12 bg-zinc-900 border border-white/[0.06] rounded-lg text-white font-mono text-sm placeholder:text-white/20 focus:outline-none focus:border-skinny-yellow/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="mt-2 text-xs text-white/30">
                Get your API key from{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-skinny-yellow hover:underline"
                >
                  aistudio.google.com/apikey
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Model Selection Card */}
        <div className={cn(
          'bg-zinc-950 border border-white/[0.06] rounded-xl overflow-hidden transition-opacity',
          !enabled && 'opacity-50'
        )}>
          <div className="p-6">
            <h2 className="text-lg font-medium text-white flex items-center gap-2 mb-4">
              <Sparkles className="text-skinny-yellow" size={18} />
              Default Orchestrator Model
            </h2>

            <div className="space-y-2">
              {ORCHESTRATOR_MODELS.map((model) => (
                <label
                  key={model.id}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors',
                    selectedModel === model.id
                      ? 'border-skinny-yellow/50 bg-skinny-yellow/5'
                      : 'border-white/[0.06] hover:border-white/10'
                  )}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={() => setSelectedModel(model.id)}
                    disabled={!enabled}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{model.name}</span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        model.tier === 'free'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-purple-500/20 text-purple-400'
                      )}>
                        {model.tier}
                      </span>
                    </div>
                    <p className="text-sm text-white/50 mt-1">{model.description}</p>
                    <p className="text-xs text-white/30 mt-1">
                      Limits: {model.limits.rpm} RPM • {typeof model.limits.tpm === 'number' ? `${(model.limits.tpm / 1000).toFixed(0)}K` : model.limits.tpm} TPM
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Mode Selection Card */}
        <div className={cn(
          'bg-zinc-950 border border-white/[0.06] rounded-xl overflow-hidden transition-opacity',
          !enabled && 'opacity-50'
        )}>
          <div className="p-6">
            <h2 className="text-lg font-medium text-white mb-4">API Key Source</h2>

            <div className="space-y-3">
              <label
                className={cn(
                  'flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors',
                  mode === 'platform_key'
                    ? 'border-skinny-yellow/50 bg-skinny-yellow/5'
                    : 'border-white/[0.06] hover:border-white/10'
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  value="platform_key"
                  checked={mode === 'platform_key'}
                  onChange={() => setMode('platform_key')}
                  disabled={!enabled}
                  className="mt-1"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-skinny-yellow" />
                    <span className="text-white font-medium">Platform Key</span>
                  </div>
                  <p className="text-sm text-white/50 mt-1">
                    All users use your platform Gemini API key. You control and pay for all AI orchestration usage.
                  </p>
                </div>
              </label>

              <label
                className={cn(
                  'flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors',
                  mode === 'user_keys'
                    ? 'border-skinny-yellow/50 bg-skinny-yellow/5'
                    : 'border-white/[0.06] hover:border-white/10'
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  value="user_keys"
                  checked={mode === 'user_keys'}
                  onChange={() => setMode('user_keys')}
                  disabled={!enabled}
                  className="mt-1"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-white/60" />
                    <span className="text-white font-medium">User Keys</span>
                  </div>
                  <p className="text-sm text-white/50 mt-1">
                    Users provide their own Gemini API keys in Settings. Falls back to environment variable.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-skinny-yellow text-black rounded-lg font-medium hover:bg-skinny-yellow/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Settings
              </>
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <h3 className="text-sm font-medium text-blue-400 mb-2">How it works</h3>
          <ul className="text-sm text-white/60 space-y-1">
            <li>• The <strong className="text-white">orchestrator</strong> is the AI Creative Director that helps users create prompts and choose models</li>
            <li>• When platform mode is <strong className="text-white">enabled</strong>, all AI chat uses your Gemini API key</li>
            <li>• When <strong className="text-white">disabled</strong>, users must provide their own API key in Settings</li>
            <li>• Changes take effect immediately for new chat sessions</li>
            <li>• The API key is stored securely and never exposed to users</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
