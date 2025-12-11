'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { Toast, ToastType, AIModel, AppSettings } from '@/lib/types'
import { mockModels } from '@/lib/types'
import { saveToStorage, loadFromStorage, STORAGE_KEYS, addRecentModel, getRecentModels, migrateStorage } from '@/lib/storage'

// ============================================
// App Context - Global App State
// ============================================

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
}

const defaultSettings: AppSettings = {
  recentModels: [],
  favoriteModels: [],
  defaultModel: 'flux-2-pro',
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
    mockModels.find(m => m.id === 'flux-2-pro') || mockModels[0]
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
