'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, CreditCard, Zap, Palette, Bell, Shield, ChevronRight, Key, Check, Eye, EyeOff, ExternalLink, Cpu, Mic, Wallet, Plus, X, Loader2, ArrowLeft, Sparkles, Receipt, Activity, Settings2, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkillsManager } from '@/components/skills/skills-manager'
import { SpendingLog } from '@/components/settings/spending-log'
import { GenerationsLog } from '@/components/settings/generations-log'
import { useUser } from '@/lib/context/user-context'
import { useApp } from '@/lib/context/app-context'
import { mockModels } from '@/lib/types'
import { createSdk } from '@whop/iframe'
import {
  ORCHESTRATOR_MODELS,
  VOICE_MODELS,
  OrchestratorModel,
  getApiSettings,
  saveApiSettings,
  ApiSettings
} from '@/lib/api-settings'
import { isAdmin } from '@/lib/admin'
import Link from 'next/link'

interface TopupPlan {
  plan_id: number
  name: string
  description: string
  credits: string
  price: string
  currency: string
  slug: string
}

interface SettingsSectionProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick?: () => void
  rightElement?: React.ReactNode
}

function SettingsSection({ icon, title, description, onClick, rightElement }: SettingsSectionProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
    >
      <div className="p-2 rounded-lg bg-zinc-800 text-skinny-yellow">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-white">{title}</h3>
        <p className="text-xs text-zinc-500 truncate">{description}</p>
      </div>
      {rightElement || <ChevronRight size={18} className="text-zinc-600" />}
    </motion.button>
  )
}

function ModelCard({
  model,
  isSelected,
  onSelect
}: {
  model: OrchestratorModel
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full p-4 rounded-xl border text-left transition-all",
        isSelected
          ? "bg-skinny-yellow/10 border-skinny-yellow/50"
          : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className={cn(
              "font-medium",
              isSelected ? "text-skinny-yellow" : "text-white"
            )}>
              {model.name}
            </h4>
            {model.supportsVoice && (
              <Mic size={12} className="text-purple-400" />
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">{model.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
            <span>{typeof model.limits.rpm === 'number' ? `${model.limits.rpm} RPM` : 'Unlimited RPM'}</span>
            <span>{typeof model.limits.tpm === 'number' ? `${(model.limits.tpm / 1000).toFixed(0)}K TPM` : 'Unlimited TPM'}</span>
          </div>
        </div>
        {isSelected && (
          <Check size={18} className="text-skinny-yellow flex-shrink-0" />
        )}
      </div>
    </button>
  )
}

interface SettingsViewProps {
  initialPanel?: 'main' | 'profile' | 'balance'
}

export function SettingsView({ initialPanel = 'main' }: SettingsViewProps) {
  const [settings, setSettings] = useState<ApiSettings>({
    googleApiKey: '',
    selectedModelId: 'gemini-2.5-flash',
    voiceEnabled: false,
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [showDefaultModelSelector, setShowDefaultModelSelector] = useState(false)
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [showSkillsManager, setShowSkillsManager] = useState(false)

  // Platform orchestration status
  const [platformEnabled, setPlatformEnabled] = useState(false)
  const [platformModel, setPlatformModel] = useState<string | null>(null)
  const [platformLoading, setPlatformLoading] = useState(true)

  // Account views
  const [activePanel, setActivePanel] = useState<'main' | 'profile' | 'balance'>(initialPanel)
  const [topupPlans, setTopupPlans] = useState<TopupPlan[]>([])

  // Sync activePanel with initialPanel when it changes
  useEffect(() => {
    setActivePanel(initialPanel)
  }, [initialPanel])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [purchaseLoading, setPurchaseLoading] = useState<number | null>(null)

  // Get user data from context
  const { user, whop, profile, balanceDollars, balanceCents, isLoading: userLoading, refreshUser } = useUser()

  // Get app context for default model
  const { selectedModel, setSelectedModel, models } = useApp()

  // Get the current default model name for display
  const currentDefaultModel = mockModels.find(m => m.id === selectedModel?.id) || mockModels.find(m => m.id === 'creative-consultant')

  // Create the Whop iframe SDK client-side using useMemo to prevent recreation
  // Per Whop docs, pass the appId for proper SDK initialization
  const iframeSdk = useMemo(() => {
    if (typeof window === 'undefined') return null
    return createSdk({
      appId: process.env.NEXT_PUBLIC_WHOP_APP_ID,
    })
  }, [])

  // Load settings on mount
  useEffect(() => {
    setSettings(getApiSettings())
  }, [])

  // Check platform orchestration status
  useEffect(() => {
    async function checkPlatformStatus() {
      try {
        const res = await fetch('/api/platform-status')
        if (res.ok) {
          const data = await res.json()
          setPlatformEnabled(data.platformOrchestrationEnabled)
          setPlatformModel(data.defaultModel)
        }
      } catch (err) {
        console.error('Failed to check platform status:', err)
      } finally {
        setPlatformLoading(false)
      }
    }
    checkPlatformStatus()
  }, [])

  // Fetch topup plans when balance panel opens
  useEffect(() => {
    if (activePanel === 'balance' && topupPlans.length === 0) {
      fetchTopupPlans()
    }
  }, [activePanel])

  const fetchTopupPlans = async () => {
    setLoadingPlans(true)
    try {
      const res = await fetch('/api/topup-plans')
      if (res.ok) {
        const data = await res.json()
        setTopupPlans(data.plans || [])
      }
    } catch (err) {
      console.error('Failed to fetch topup plans:', err)
    } finally {
      setLoadingPlans(false)
    }
  }

  const handlePurchase = async (plan: TopupPlan) => {
    // Use profile.id (from user_profiles table) - this is the main user table
    const userId = profile?.id || user?.id
    if (!userId) {
      console.error('No user ID for purchase - profile:', profile, 'user:', user)
      return
    }

    setPurchaseLoading(plan.plan_id)

    try {
      // Build headers including Whop auth from localStorage (set by whop-embed page)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')

        if (devToken) {
          headers['x-whop-user-token'] = devToken
        }
        if (devUserId) {
          headers['x-whop-user-id'] = devUserId
        }
      }

      const res = await fetch('/api/charge', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planId: plan.plan_id,
          userId: userId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create checkout')
      }

      const { id, planId } = await res.json()
      console.log('Checkout configuration created:', { id, planId })

      // Use the @whop/react iframe SDK hook (like SKINNY AIO v3)
      try {
        console.log('Calling iframeSdk.inAppPurchase with:', { planId, id })
        console.log('iframeSdk available:', !!iframeSdk)

        if (!iframeSdk) {
          throw new Error('Iframe SDK not available - make sure you are accessing the app through Whop')
        }

        // Call inAppPurchase like SKINNY AIO v3 does
        const result = await iframeSdk.inAppPurchase({ planId, id })
        console.log('Purchase result:', result)

        const status = result?.status as string
        if (status === 'ok') {
          // Refresh user data after successful purchase
          setTimeout(() => refreshUser(), 1000)
          alert('Purchase successful! Your credits have been added.')
        } else if (status === 'error') {
          console.error('Purchase error:', (result as any)?.error)
          alert(`Purchase failed: ${(result as any)?.error || 'Unknown error'}`)
        } else {
          console.log('Purchase status:', status)
        }
      } catch (sdkError: any) {
        // If not in Whop iframe, the SDK will throw an error
        console.error('Iframe SDK error:', sdkError)
        alert('Top-ups are only available when the app is accessed through the Whop platform. Please open Skinny Studio from your Whop dashboard.')
      }
    } catch (err: any) {
      console.error('Purchase error:', err)
      alert(`Purchase failed: ${err?.message || 'Unknown error'}`)
    } finally {
      setPurchaseLoading(null)
    }
  }

  const handleApiKeyChange = (value: string) => {
    setSettings(prev => ({ ...prev, googleApiKey: value }))
    setApiKeySaved(false)
  }

  const handleSaveApiKey = () => {
    saveApiSettings({ googleApiKey: settings.googleApiKey })
    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const handleModelSelect = (modelId: string) => {
    setSettings(prev => ({ ...prev, selectedModelId: modelId }))
    saveApiSettings({ selectedModelId: modelId })
  }

  const selectedOrchestratorModel = ORCHESTRATOR_MODELS.find(m => m.id === settings.selectedModelId) || ORCHESTRATOR_MODELS[2]

  // Profile Panel
  if (activePanel === 'profile') {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => setActivePanel('main')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Back to Settings</span>
          </button>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Profile</h2>
            <p className="text-sm text-zinc-500 mt-1">Your account information</p>
          </motion.div>

          {/* Profile Info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Avatar */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center text-2xl font-bold text-black">
                {whop?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{whop?.username || 'User'}</h3>
                <p className="text-sm text-zinc-500">{whop?.email || 'No email'}</p>
                {profile?.lifetime_access && (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-skinny-yellow/20 text-skinny-yellow text-xs font-medium">
                    <Sparkles size={12} />
                    Lifetime Access
                  </span>
                )}
              </div>
            </div>

            {/* User IDs */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Account Details</h4>

              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">Whop User ID</span>
                <span className="text-sm text-zinc-300 font-mono">{whop?.id || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">Internal ID</span>
                <span className="text-sm text-zinc-300 font-mono text-xs">{user?.id?.slice(0, 8) || 'N/A'}...</span>
              </div>
            </div>

            {/* Balance Quick View */}
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm text-zinc-400">Current Balance</h4>
                  <p className="text-2xl font-bold text-skinny-yellow">${balanceDollars}</p>
                </div>
                <button
                  onClick={() => setActivePanel('balance')}
                  className="px-4 py-2 rounded-lg bg-skinny-yellow text-black font-bold text-sm hover:bg-skinny-green transition-colors"
                >
                  Top Up
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // Balance & Top-Up Panel
  if (activePanel === 'balance') {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => setActivePanel('main')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Back to Settings</span>
          </button>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Balance & Usage</h2>
            <p className="text-sm text-zinc-500 mt-1">Manage your credits</p>
          </motion.div>

          {/* Current Balance */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <Wallet size={24} className="text-skinny-yellow" />
              <span className="text-sm text-zinc-400">Current Balance</span>
            </div>
            <p className="text-4xl font-bold text-white">${balanceDollars}</p>
            <p className="text-xs text-zinc-500 mt-1">{balanceCents} credits</p>
          </motion.div>

          {/* Top-Up Plans */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Top Up Credits</h3>

            {loadingPlans ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-zinc-500" />
              </div>
            ) : topupPlans.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No top-up plans available</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {topupPlans.map((plan) => (
                  <button
                    key={plan.plan_id}
                    onClick={() => handlePurchase(plan)}
                    disabled={purchaseLoading !== null}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all hover:scale-[1.02]",
                      "bg-zinc-900/50 border-zinc-800 hover:border-skinny-yellow/50",
                      purchaseLoading === plan.plan_id && "opacity-50"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-2xl font-bold text-white">${parseFloat(plan.price).toFixed(0)}</span>
                      {purchaseLoading === plan.plan_id && (
                        <Loader2 size={16} className="animate-spin text-skinny-yellow" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">{plan.description}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Generation History */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8"
            >
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity size={14} />
                Generation History
              </h3>
              <GenerationsLog />
            </motion.div>

            {/* Usage Info */}
            <div className="mt-8 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Pricing Guide</h4>
              <div className="space-y-2 text-xs text-zinc-400">
                <p className="text-[10px] text-zinc-600 mb-2">Image Generation</p>
                <div className="flex justify-between">
                  <span>P-Image Edit</span>
                  <span className="text-zinc-300">3¢ per image</span>
                </div>
                <div className="flex justify-between">
                  <span>Seedream 4.5</span>
                  <span className="text-zinc-300">7¢ per image</span>
                </div>
                <div className="flex justify-between">
                  <span>FLUX 2 Pro / Dev</span>
                  <span className="text-zinc-300">7¢ per image</span>
                </div>
                <div className="flex justify-between">
                  <span>Qwen Image Edit Plus</span>
                  <span className="text-zinc-300">7¢ per image</span>
                </div>
                <div className="flex justify-between">
                  <span>Nano Banana Pro</span>
                  <span className="text-zinc-300">30¢ per image</span>
                </div>
                <div className="flex justify-between">
                  <span>Nano Banana Pro 4K</span>
                  <span className="text-zinc-300">45¢ per image</span>
                </div>
                <p className="text-[10px] text-zinc-600 mb-2 mt-4">Video Generation (per second)</p>
                <div className="flex justify-between">
                  <span>Wan 2.5 T2V (480p)</span>
                  <span className="text-zinc-300">8¢/sec</span>
                </div>
                <div className="flex justify-between">
                  <span>Wan 2.5 I2V (720p)</span>
                  <span className="text-zinc-300">13¢/sec</span>
                </div>
                <div className="flex justify-between">
                  <span>Kling V2.5 Turbo Pro</span>
                  <span className="text-zinc-300">15¢/sec</span>
                </div>
                <div className="flex justify-between">
                  <span>Veo 3.1 Fast</span>
                  <span className="text-zinc-300">15-25¢/sec</span>
                </div>
                <div className="flex justify-between">
                  <span>Veo 3.1</span>
                  <span className="text-zinc-300">25-50¢/sec</span>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">Veo pricing varies with audio (higher) vs no audio (lower)</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // Main Settings View
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Settings</h2>
          <p className="text-sm text-zinc-500 mt-1">Manage your account and preferences</p>
        </motion.div>

        {/* API Configuration Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">AI Creative Director</h3>

          {/* Platform Mode Enabled Banner */}
          {platformLoading ? (
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 mb-3">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-zinc-500" />
                <span className="text-sm text-zinc-500">Checking configuration...</span>
              </div>
            </div>
          ) : platformEnabled ? (
            <div className="p-4 rounded-xl bg-gradient-to-r from-skinny-green/10 to-emerald-500/10 border border-skinny-green/30 mb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-skinny-green/20">
                  <Server size={18} className="text-skinny-green" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-white">Platform Mode Enabled</h4>
                    <span className="px-2 py-0.5 rounded-full bg-skinny-green/20 text-skinny-green text-[10px] font-bold uppercase">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    The AI Creative Director is configured by the platform administrator
                  </p>
                </div>
              </div>
              {platformModel && (
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                  <Cpu size={14} className="text-zinc-500" />
                  <span className="text-xs text-zinc-400">Model:</span>
                  <span className="text-xs text-white font-medium">
                    {ORCHESTRATOR_MODELS.find(m => m.id === platformModel)?.name || platformModel}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* API Key Input - Only show when platform mode is disabled */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 mb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Key size={16} className="text-skinny-yellow" />
                  <span className="text-sm font-medium text-white">Google AI API Key</span>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-xs text-skinny-yellow hover:text-skinny-green transition-colors"
                  >
                    Get free key <ExternalLink size={12} />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.googleApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="AIza..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 pr-20 text-sm focus:outline-none focus:border-skinny-yellow/50 transition-colors font-mono"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                    >
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <p className="text-[10px] text-zinc-600">
                    Your key is stored locally and never sent to our servers
                  </p>
                  <button
                    onClick={handleSaveApiKey}
                    disabled={!settings.googleApiKey}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                      settings.googleApiKey
                        ? apiKeySaved
                          ? "bg-green-500/20 text-green-400"
                          : "bg-skinny-yellow text-black hover:bg-skinny-green"
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    )}
                  >
                    {apiKeySaved ? 'Saved!' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Model Selector - Only show when platform mode is disabled */}
              <button
                onClick={() => setShowModelSelector(!showModelSelector)}
                className="w-full p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-zinc-800 text-skinny-yellow">
                    <Cpu size={18} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-white">Orchestrator Model</h4>
                    <p className="text-xs text-zinc-500">{selectedOrchestratorModel.name}</p>
                  </div>
                  <ChevronRight
                    size={18}
                    className={cn(
                      "text-zinc-600 transition-transform",
                      showModelSelector && "rotate-90"
                    )}
                  />
                </div>
              </button>

              <AnimatePresence>
                {showModelSelector && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-3">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Free Tier Models</p>
                      {ORCHESTRATOR_MODELS.map(model => (
                        <ModelCard
                          key={model.id}
                          model={model}
                          isSelected={settings.selectedModelId === model.id}
                          onSelect={() => handleModelSelect(model.id)}
                        />
                      ))}

                      {/* Voice models section - coming soon */}
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2 mt-4 flex items-center gap-2">
                        Voice Mode <span className="text-purple-400">(Coming Soon)</span>
                      </p>
                      {VOICE_MODELS.map(model => (
                        <div key={model.id} className="opacity-50 cursor-not-allowed">
                          <ModelCard
                            model={model}
                            isSelected={false}
                            onSelect={() => {}}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>

        {/* Account Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Account</h3>
          <div className="space-y-2">
            <SettingsSection
              icon={<User size={18} />}
              title="Profile"
              description={whop?.username || 'Manage your profile'}
              onClick={() => setActivePanel('profile')}
              rightElement={
                userLoading ? (
                  <Loader2 size={16} className="animate-spin text-zinc-500" />
                ) : undefined
              }
            />
            <SettingsSection
              icon={<CreditCard size={18} />}
              title="Balance & Usage"
              description={userLoading ? 'Loading...' : `$${balanceDollars} available`}
              onClick={() => setActivePanel('balance')}
              rightElement={
                <span className="text-skinny-yellow font-bold text-sm">${balanceDollars}</span>
              }
            />
          </div>
        </motion.div>

        {/* Creative Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Creative</h3>
          <div className="space-y-2">
            <SettingsSection
              icon={<Zap size={18} />}
              title="Skills"
              description="Create and manage custom prompting guides"
              onClick={() => setShowSkillsManager(true)}
            />

            {/* Default Model Selector */}
            <button
              onClick={() => setShowDefaultModelSelector(!showDefaultModelSelector)}
              className="w-full p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800 text-skinny-yellow">
                  <Palette size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-white">Default Model</h4>
                  <p className="text-xs text-zinc-500">{currentDefaultModel?.name || 'Creative Consultant'}</p>
                </div>
                <ChevronRight
                  size={18}
                  className={cn(
                    "text-zinc-600 transition-transform",
                    showDefaultModelSelector && "rotate-90"
                  )}
                />
              </div>
            </button>

            <AnimatePresence>
              {showDefaultModelSelector && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-3">
                    {/* Chat Models */}
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Chat & Prompt Building</p>
                    {mockModels.filter(m => m.category === 'chat').map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          const fullModel = models.find(m => m.id === model.id) || model
                          setSelectedModel(fullModel)
                        }}
                        className={cn(
                          "w-full p-4 rounded-xl border text-left transition-all",
                          selectedModel?.id === model.id
                            ? "bg-skinny-yellow/10 border-skinny-yellow/50"
                            : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className={cn(
                              "font-medium",
                              selectedModel?.id === model.id ? "text-skinny-yellow" : "text-white"
                            )}>
                              {model.name}
                            </h4>
                            <p className="text-xs text-zinc-500 mt-1">{model.description}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {model.tags?.slice(0, 3).map(tag => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-500">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          {selectedModel?.id === model.id && (
                            <Check size={18} className="text-skinny-yellow flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}

                    {/* Image Models */}
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2 mt-4">Image Generation</p>
                    {mockModels.filter(m => m.category === 'image').slice(0, 6).map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          const fullModel = models.find(m => m.id === model.id) || model
                          setSelectedModel(fullModel)
                        }}
                        className={cn(
                          "w-full p-4 rounded-xl border text-left transition-all",
                          selectedModel?.id === model.id
                            ? "bg-skinny-yellow/10 border-skinny-yellow/50"
                            : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className={cn(
                              "font-medium",
                              selectedModel?.id === model.id ? "text-skinny-yellow" : "text-white"
                            )}>
                              {model.name}
                            </h4>
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{model.description}</p>
                          </div>
                          {selectedModel?.id === model.id && (
                            <Check size={18} className="text-skinny-yellow flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}

                    {/* Video Models */}
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2 mt-4">Video Generation</p>
                    {mockModels.filter(m => m.category === 'video').slice(0, 4).map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          const fullModel = models.find(m => m.id === model.id) || model
                          setSelectedModel(fullModel)
                        }}
                        className={cn(
                          "w-full p-4 rounded-xl border text-left transition-all",
                          selectedModel?.id === model.id
                            ? "bg-skinny-yellow/10 border-skinny-yellow/50"
                            : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className={cn(
                              "font-medium",
                              selectedModel?.id === model.id ? "text-skinny-yellow" : "text-white"
                            )}>
                              {model.name}
                            </h4>
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{model.description}</p>
                          </div>
                          {selectedModel?.id === model.id && (
                            <Check size={18} className="text-skinny-yellow flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Skills Manager Modal */}
        <SkillsManager
          isOpen={showSkillsManager}
          onClose={() => setShowSkillsManager(false)}
        />

        {/* Preferences Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Preferences</h3>
          <div className="space-y-2">
            <SettingsSection
              icon={<Bell size={18} />}
              title="Notifications"
              description="Manage notification preferences"
            />
            <SettingsSection
              icon={<Shield size={18} />}
              title="Privacy"
              description="Control your data and privacy settings"
            />
          </div>
        </motion.div>

        {/* Admin Section - Only visible to admins */}
        {isAdmin(whop?.id) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-8"
          >
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Administration</h3>
            <div className="space-y-2">
              <Link href="/admin">
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-700/50 hover:border-purple-600 text-left transition-colors"
                >
                  <div className="p-2 rounded-lg bg-purple-800/50 text-purple-300">
                    <Settings2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white">Admin Dashboard</h3>
                    <p className="text-xs text-zinc-400 truncate">Manage models, users, and analytics</p>
                  </div>
                  <ChevronRight size={18} className="text-purple-400" />
                </motion.div>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Version Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center py-8"
        >
          <p className="text-xs text-zinc-600">
            Skinny Studio v1.0.0
          </p>
          <p className="text-xs text-zinc-700 mt-1">
            Powered by Replicate & Google AI
          </p>
        </motion.div>
      </div>
    </div>
  )
}
