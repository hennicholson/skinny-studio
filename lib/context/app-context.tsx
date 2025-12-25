'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { Toast, ToastType, AIModel, AppSettings } from '@/lib/types'
import { mockModels } from '@/lib/types'
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addRecentModel, getRecentModels, migrateStorage } from '@/lib/storage'

// ============================================
// App Context - Global App State
// ============================================

// Balance check response from estimate-cost API
export interface CostEstimate {
  model: string
  modelSlug: string
  costCents: number
  maxCostCents: number
  userBalance: number
  hasLifetimeAccess: boolean
  affordable: boolean
  breakdown?: {
    baseCostCents: number
    sequentialMode?: boolean
    maxImages?: number
    maxCostCents?: number
    duration?: number
    resolution?: string
    costPerSecond?: number
    resolutionMultiplier?: number
  }
}

// Insufficient balance modal state
export interface InsufficientBalanceState {
  isOpen: boolean
  required: number
  available: number
  modelName?: string
}

interface AppContextType {
  // Models
  models: AIModel[]
  selectedModel: AIModel
  setSelectedModel: (model: AIModel) => void
  recentModels: string[]

  // Settings
  settings: AppSettings
  updateSettings: (updates: Partial<AppSettings>) => void

  // Toasts
  toasts: Toast[]
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void
  showToast: (type: ToastType, message: string, duration?: number) => void // Alias for addToast

  // Loading
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Balance & Cost
  userBalance: number
  setUserBalance: (balance: number) => void
  hasLifetimeAccess: boolean
  setHasLifetimeAccess: (has: boolean) => void
  insufficientBalanceModal: InsufficientBalanceState
  showInsufficientBalance: (required: number, available: number, modelName?: string) => void
  hideInsufficientBalance: () => void
  estimateCost: (params: {
    model: string
    duration?: number
    resolution?: string
    generateAudio?: boolean
    sequentialImageGeneration?: 'disabled' | 'auto'
    maxImages?: number
  }) => Promise<CostEstimate | null>
}

const defaultSettings: AppSettings = {
  recentModels: [],
  favoriteModels: [],
  defaultModel: 'creative-consultant',
  theme: 'dark',
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // Run migrations on mount
  useEffect(() => {
    migrateStorage()
  }, [])

  // Models state
  const [models] = useState<AIModel[]>(mockModels)
  const [selectedModel, setSelectedModelState] = useState<AIModel>(
    mockModels.find(m => m.id === 'creative-consultant') || mockModels[0]
  )
  const [recentModels, setRecentModels] = useState<string[]>([])

  // Load recent models on mount
  useEffect(() => {
    setRecentModels(getRecentModels())
  }, [])

  // Settings state
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  // Load settings on mount
  useEffect(() => {
    const saved = loadFromStorage<AppSettings>(STORAGE_KEYS.SETTINGS)
    if (saved) {
      setSettings({ ...defaultSettings, ...saved })
    }
  }, [])

  // Toasts state
  const [toasts, setToasts] = useState<Toast[]>([])

  // Loading state
  const [isLoading, setIsLoading] = useState(false)

  // Balance state
  const [userBalance, setUserBalance] = useState(0)
  const [hasLifetimeAccess, setHasLifetimeAccess] = useState(false)

  // Insufficient balance modal state
  const [insufficientBalanceModal, setInsufficientBalanceModal] = useState<InsufficientBalanceState>({
    isOpen: false,
    required: 0,
    available: 0,
    modelName: undefined,
  })

  // Set selected model with recent tracking
  const setSelectedModel = useCallback((model: AIModel) => {
    setSelectedModelState(model)
    addRecentModel(model.id)
    setRecentModels(getRecentModels())
  }, [])

  // Update settings
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates }
      saveToStorage(STORAGE_KEYS.SETTINGS, newSettings)
      return newSettings
    })
  }, [])

  // Add toast
  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const toast: Toast = { id, type, message, duration }

    setToasts(prev => [...prev, toast])

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
  }, [])

  // Remove toast
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Show insufficient balance modal
  const showInsufficientBalance = useCallback((required: number, available: number, modelName?: string) => {
    setInsufficientBalanceModal({
      isOpen: true,
      required,
      available,
      modelName,
    })
  }, [])

  // Hide insufficient balance modal
  const hideInsufficientBalance = useCallback(() => {
    setInsufficientBalanceModal(prev => ({
      ...prev,
      isOpen: false,
    }))
  }, [])

  // Estimate cost before generation
  const estimateCost = useCallback(async (params: {
    model: string
    duration?: number
    resolution?: string
    generateAudio?: boolean
    sequentialImageGeneration?: 'disabled' | 'auto'
    maxImages?: number
  }): Promise<CostEstimate | null> => {
    try {
      // Build headers with Whop auth
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) headers['x-whop-user-token'] = devToken
        if (devUserId) headers['x-whop-user-id'] = devUserId
      }

      const response = await fetch('/api/estimate-cost', {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        console.error('Failed to estimate cost:', await response.text())
        return null
      }

      const data = await response.json()

      // Update local balance state from response
      if (data.userBalance !== undefined) {
        setUserBalance(data.userBalance)
      }
      if (data.hasLifetimeAccess !== undefined) {
        setHasLifetimeAccess(data.hasLifetimeAccess)
      }

      return data as CostEstimate
    } catch (error) {
      console.error('Error estimating cost:', error)
      return null
    }
  }, [])

  const value: AppContextType = {
    models,
    selectedModel,
    setSelectedModel,
    recentModels,
    settings,
    updateSettings,
    toasts,
    addToast,
    removeToast,
    showToast: addToast, // Alias
    isLoading,
    setIsLoading,
    // Balance & Cost
    userBalance,
    setUserBalance,
    hasLifetimeAccess,
    setHasLifetimeAccess,
    insufficientBalanceModal,
    showInsufficientBalance,
    hideInsufficientBalance,
    estimateCost,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
