'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  Session,
  SessionAsset,
  SessionType,
  SessionTemplate,
  SessionAssetTemplate,
} from '@/lib/types'
import { sessionTemplates, getSessionTemplate } from '@/lib/sessions/session-templates'
import { SkinnyBriefData } from '@/components/chat/skinny-brief'

// ============================================
// STATE TYPES
// ============================================

interface SessionsState {
  // All sessions
  sessions: Session[]

  // Current active session
  currentSession: Session | null

  // Loading states
  isLoading: boolean
  isSaving: boolean
  isGenerating: string | null // Asset ID being generated

  // Error state
  error: string | null
}

type SessionsAction =
  | { type: 'SET_SESSIONS'; payload: Session[] }
  | { type: 'SET_CURRENT_SESSION'; payload: Session | null }
  | { type: 'ADD_SESSION'; payload: Session }
  | { type: 'UPDATE_SESSION'; payload: { id: string; updates: Partial<Session> } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'UPDATE_ASSET'; payload: { sessionId: string; assetId: string; updates: Partial<SessionAsset> } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_GENERATING'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_CURRENT' }

const initialState: SessionsState = {
  sessions: [],
  currentSession: null,
  isLoading: false,
  isSaving: false,
  isGenerating: null,
  error: null,
}

// ============================================
// REDUCER
// ============================================

function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload, isLoading: false }

    case 'SET_CURRENT_SESSION':
      return { ...state, currentSession: action.payload, isLoading: false }

    case 'ADD_SESSION':
      return {
        ...state,
        sessions: [action.payload, ...state.sessions],
        currentSession: action.payload,
      }

    case 'UPDATE_SESSION': {
      const { id, updates } = action.payload
      const updatedSessions = state.sessions.map(s =>
        s.id === id ? { ...s, ...updates, updatedAt: new Date() } : s
      )
      const updatedCurrent = state.currentSession?.id === id
        ? { ...state.currentSession, ...updates, updatedAt: new Date() }
        : state.currentSession
      return {
        ...state,
        sessions: updatedSessions,
        currentSession: updatedCurrent,
      }
    }

    case 'DELETE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter(s => s.id !== action.payload),
        currentSession: state.currentSession?.id === action.payload
          ? null
          : state.currentSession,
      }

    case 'UPDATE_ASSET': {
      const { sessionId, assetId, updates } = action.payload
      const updateAssets = (session: Session): Session => ({
        ...session,
        assets: session.assets.map(a =>
          a.id === assetId ? { ...a, ...updates } : a
        ),
        updatedAt: new Date(),
      })

      return {
        ...state,
        sessions: state.sessions.map(s =>
          s.id === sessionId ? updateAssets(s) : s
        ),
        currentSession: state.currentSession?.id === sessionId
          ? updateAssets(state.currentSession)
          : state.currentSession,
      }
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_SAVING':
      return { ...state, isSaving: action.payload }

    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false, isSaving: false }

    case 'CLEAR_CURRENT':
      return { ...state, currentSession: null }

    default:
      return state
  }
}

// ============================================
// STORAGE HELPERS (localStorage as fallback)
// ============================================

const STORAGE_KEY = 'skinny-studio-sessions'

function loadFromStorage(): Session[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const sessions = JSON.parse(stored) as Session[]
    // Convert date strings back to Date objects
    return sessions.map(s => ({
      ...s,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    }))
  } catch (error) {
    console.error('Error loading sessions from storage:', error)
    return []
  }
}

function saveToStorage(sessions: Session[]): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch (error) {
    console.error('Error saving sessions to storage:', error)
  }
}

// ============================================
// API HELPERS (Supabase persistence)
// ============================================

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    const devToken = localStorage.getItem('whop-dev-token')
    const devUserId = localStorage.getItem('whop-dev-user-id')
    if (devToken) headers['x-whop-user-token'] = devToken
    if (devUserId) headers['x-whop-user-id'] = devUserId
  }
  return headers
}

async function fetchSessionsFromAPI(): Promise<Session[]> {
  try {
    const response = await fetch('/api/sessions', { headers: getAuthHeaders() })
    if (!response.ok) {
      throw new Error('Failed to fetch sessions')
    }
    const data = await response.json()
    return (data.sessions || []).map((s: any) => ({
      ...s,
      templateId: s.template_id,
      briefContext: s.brief_context,
      createdAt: new Date(s.created_at),
      updatedAt: new Date(s.updated_at),
    }))
  } catch (error) {
    console.error('Error fetching sessions from API:', error)
    return []
  }
}

async function saveSessionToAPI(session: Session): Promise<boolean> {
  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        templateId: session.templateId,
        title: session.title,
        briefContext: session.briefContext,
        assets: session.assets,
      }),
    })
    return response.ok
  } catch (error) {
    console.error('Error saving session to API:', error)
    return false
  }
}

async function updateSessionInAPI(id: string, updates: Partial<Session>): Promise<boolean> {
  try {
    const response = await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title: updates.title,
        status: updates.status,
        briefContext: updates.briefContext,
        assets: updates.assets,
      }),
    })
    return response.ok
  } catch (error) {
    console.error('Error updating session in API:', error)
    return false
  }
}

async function deleteSessionFromAPI(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/sessions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    return response.ok
  } catch (error) {
    console.error('Error deleting session from API:', error)
    return false
  }
}

// ============================================
// HELPERS
// ============================================

function generateId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function createAssetsFromTemplate(template: SessionTemplate): SessionAsset[] {
  return template.assets.map((asset, index) => ({
    id: `asset-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`,
    templateAssetId: asset.id,
    name: asset.name,
    status: 'pending' as const,
    sortOrder: index,
  }))
}

// ============================================
// CONTEXT INTERFACE
// ============================================

interface CreateSessionInput {
  templateId: string
  title?: string
  briefContext?: SkinnyBriefData | null
}

interface SessionsContextValue {
  // State
  sessions: Session[]
  currentSession: Session | null
  isLoading: boolean
  isSaving: boolean
  isGenerating: string | null
  error: string | null

  // Templates (built-in from static file)
  templates: SessionTemplate[]
  getTemplate: (id: string) => SessionTemplate | undefined

  // Custom templates (user-created)
  customTemplates: SessionTemplate[]
  addCustomTemplate: (template: SessionTemplate) => void
  updateCustomTemplate: (id: string, updates: Partial<SessionTemplate>) => void
  deleteCustomTemplate: (id: string) => void
  getAllTemplates: () => SessionTemplate[]

  // Session actions
  loadSessions: () => void
  createSession: (input: CreateSessionInput) => Session
  loadSession: (id: string) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  deleteSession: (id: string) => void
  clearCurrentSession: () => void

  // Asset actions
  updateAsset: (assetId: string, updates: Partial<SessionAsset>) => void
  skipAsset: (assetId: string) => void
  markAssetGenerating: (assetId: string, generationId: string) => void
  markAssetCompleted: (assetId: string, outputUrl: string) => void
  markAssetFailed: (assetId: string) => void

  // Progress helpers
  getSessionProgress: (sessionId?: string) => { completed: number; total: number; required: number; requiredCompleted: number }
  isSessionComplete: (sessionId?: string) => boolean
  getNextPendingAsset: (sessionId?: string) => SessionAsset | null
  getAssetTemplate: (asset: SessionAsset) => SessionAssetTemplate | undefined
}

const SessionsContext = createContext<SessionsContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

// Custom templates localStorage key
const CUSTOM_TEMPLATES_KEY = 'skinny-studio-custom-templates'

function loadCustomTemplates(): SessionTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(CUSTOM_TEMPLATES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveCustomTemplates(templates: SessionTemplate[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates))
  } catch (error) {
    console.error('Failed to save custom templates:', error)
  }
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionsReducer, initialState)
  const [customTemplates, setCustomTemplates] = useState<SessionTemplate[]>([])

  // Load custom templates from localStorage on mount
  useEffect(() => {
    setCustomTemplates(loadCustomTemplates())
  }, [])

  // Save custom templates to localStorage on change
  useEffect(() => {
    if (customTemplates.length > 0) {
      saveCustomTemplates(customTemplates)
    }
  }, [customTemplates])

  // Load sessions from API on mount (with localStorage fallback)
  useEffect(() => {
    const loadInitialSessions = async () => {
      dispatch({ type: 'SET_LOADING', payload: true })

      // Try API first
      const apiSessions = await fetchSessionsFromAPI()
      if (apiSessions.length > 0) {
        dispatch({ type: 'SET_SESSIONS', payload: apiSessions })
        // Also sync to localStorage as backup
        saveToStorage(apiSessions)
      } else {
        // Fall back to localStorage
        const localSessions = loadFromStorage()
        dispatch({ type: 'SET_SESSIONS', payload: localSessions })
      }
    }
    loadInitialSessions()
  }, [])

  // Save sessions to localStorage on change (as backup)
  useEffect(() => {
    if (state.sessions.length > 0) {
      saveToStorage(state.sessions)
    }
  }, [state.sessions])

  // ==========================================
  // SESSION ACTIONS
  // ==========================================

  const loadSessions = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })

    // Try API first
    const apiSessions = await fetchSessionsFromAPI()
    if (apiSessions.length > 0) {
      dispatch({ type: 'SET_SESSIONS', payload: apiSessions })
      saveToStorage(apiSessions)
    } else {
      const localSessions = loadFromStorage()
      dispatch({ type: 'SET_SESSIONS', payload: localSessions })
    }
  }, [])

  const createSession = useCallback((input: CreateSessionInput): Session => {
    const template = getSessionTemplate(input.templateId)
    if (!template) {
      throw new Error(`Template not found: ${input.templateId}`)
    }

    const session: Session = {
      id: generateId(),
      templateId: input.templateId,
      title: input.title || `${template.name} - ${new Date().toLocaleDateString()}`,
      status: 'planning',
      assets: createAssetsFromTemplate(template),
      briefContext: input.briefContext ? {
        vibe: input.briefContext.vibe,
        platform: input.briefContext.platform,
        style: input.briefContext.style,
        outputType: input.briefContext.outputType,
      } : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    dispatch({ type: 'ADD_SESSION', payload: session })

    // Also save to API (async, non-blocking)
    saveSessionToAPI(session).then(success => {
      if (!success) {
        console.warn('Failed to save session to API, using localStorage only')
      }
    })

    toast.success(`${template.name} session created!`)
    return session
  }, [])

  const loadSession = useCallback((id: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    const session = state.sessions.find(s => s.id === id) || null
    dispatch({ type: 'SET_CURRENT_SESSION', payload: session })
  }, [state.sessions])

  const updateSession = useCallback((id: string, updates: Partial<Session>) => {
    dispatch({ type: 'UPDATE_SESSION', payload: { id, updates } })

    // Also update in API (async, non-blocking)
    updateSessionInAPI(id, updates).then(success => {
      if (!success) {
        console.warn('Failed to update session in API')
      }
    })
  }, [])

  const deleteSession = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SESSION', payload: id })

    // Also delete from API (async, non-blocking)
    deleteSessionFromAPI(id).then(success => {
      if (!success) {
        console.warn('Failed to delete session from API')
      }
    })
    toast.success('Session deleted')
  }, [])

  const clearCurrentSession = useCallback(() => {
    dispatch({ type: 'CLEAR_CURRENT' })
  }, [])

  // ==========================================
  // ASSET ACTIONS
  // ==========================================

  const updateAsset = useCallback((assetId: string, updates: Partial<SessionAsset>) => {
    if (!state.currentSession) return
    dispatch({
      type: 'UPDATE_ASSET',
      payload: { sessionId: state.currentSession.id, assetId, updates },
    })
  }, [state.currentSession])

  const skipAsset = useCallback((assetId: string) => {
    updateAsset(assetId, { status: 'skipped' })
  }, [updateAsset])

  const markAssetGenerating = useCallback((assetId: string, generationId: string) => {
    updateAsset(assetId, { status: 'generating', generationId })
    dispatch({ type: 'SET_GENERATING', payload: assetId })
  }, [updateAsset])

  const markAssetCompleted = useCallback((assetId: string, outputUrl: string) => {
    updateAsset(assetId, { status: 'completed', outputUrl })
    dispatch({ type: 'SET_GENERATING', payload: null })

    // Check if session is now complete
    if (state.currentSession) {
      const session = state.currentSession
      const template = getSessionTemplate(session.templateId)
      if (template) {
        const updatedAssets = session.assets.map(a =>
          a.id === assetId ? { ...a, status: 'completed' as const, outputUrl } : a
        )
        const requiredAssetIds = template.assets
          .filter(a => a.required)
          .map(a => a.id)
        const requiredCompleted = updatedAssets.filter(
          a => requiredAssetIds.includes(a.templateAssetId) &&
               (a.status === 'completed' || a.status === 'skipped')
        ).length

        if (requiredCompleted === requiredAssetIds.length) {
          dispatch({
            type: 'UPDATE_SESSION',
            payload: { id: session.id, updates: { status: 'completed' } },
          })
          toast.success('Session complete! All required assets are done.')
        }
      }
    }
  }, [updateAsset, state.currentSession])

  const markAssetFailed = useCallback((assetId: string) => {
    updateAsset(assetId, { status: 'pending' }) // Reset to pending on failure
    dispatch({ type: 'SET_GENERATING', payload: null })
  }, [updateAsset])

  // ==========================================
  // PROGRESS HELPERS
  // ==========================================

  const getSessionProgress = useCallback((sessionId?: string): { completed: number; total: number; required: number; requiredCompleted: number } => {
    const session = sessionId
      ? state.sessions.find(s => s.id === sessionId)
      : state.currentSession

    if (!session) {
      return { completed: 0, total: 0, required: 0, requiredCompleted: 0 }
    }

    const template = getSessionTemplate(session.templateId)
    if (!template) {
      return { completed: 0, total: 0, required: 0, requiredCompleted: 0 }
    }

    const total = session.assets.length
    const completed = session.assets.filter(
      a => a.status === 'completed' || a.status === 'skipped'
    ).length

    const requiredAssetIds = template.assets
      .filter(a => a.required)
      .map(a => a.id)
    const required = requiredAssetIds.length
    const requiredCompleted = session.assets.filter(
      a => requiredAssetIds.includes(a.templateAssetId) &&
           (a.status === 'completed' || a.status === 'skipped')
    ).length

    return { completed, total, required, requiredCompleted }
  }, [state.sessions, state.currentSession])

  const isSessionComplete = useCallback((sessionId?: string): boolean => {
    const progress = getSessionProgress(sessionId)
    return progress.requiredCompleted >= progress.required && progress.required > 0
  }, [getSessionProgress])

  const getNextPendingAsset = useCallback((sessionId?: string): SessionAsset | null => {
    const session = sessionId
      ? state.sessions.find(s => s.id === sessionId)
      : state.currentSession

    if (!session) return null

    // Get template to prioritize required assets
    const template = getSessionTemplate(session.templateId)
    if (!template) return null

    const requiredAssetIds = template.assets
      .filter(a => a.required)
      .map(a => a.id)

    // First, find pending required assets
    const pendingRequired = session.assets.find(
      a => a.status === 'pending' && requiredAssetIds.includes(a.templateAssetId)
    )
    if (pendingRequired) return pendingRequired

    // Then, find any pending asset
    return session.assets.find(a => a.status === 'pending') || null
  }, [state.sessions, state.currentSession])

  const getAssetTemplate = useCallback((asset: SessionAsset | null | undefined): SessionAssetTemplate | undefined => {
    if (!asset) return undefined

    const session = state.currentSession
    if (!session) return undefined

    const template = getSessionTemplate(session.templateId)
    if (!template) return undefined

    return template.assets.find(a => a.id === asset.templateAssetId)
  }, [state.currentSession])

  const getTemplate = useCallback((id: string): SessionTemplate | undefined => {
    // Check custom templates first
    const custom = customTemplates.find(t => t.id === id)
    if (custom) return custom
    // Then check built-in templates
    return getSessionTemplate(id)
  }, [customTemplates])

  // ==========================================
  // CUSTOM TEMPLATE MANAGEMENT
  // ==========================================

  const addCustomTemplate = useCallback((template: SessionTemplate) => {
    setCustomTemplates(prev => {
      // Ensure template has unique ID
      const newTemplate = {
        ...template,
        id: template.id || `custom-${Date.now()}`,
        type: 'custom' as const,
      }
      const updated = [...prev, newTemplate]
      saveCustomTemplates(updated)
      toast.success(`Template "${template.name}" created!`)
      return updated
    })
  }, [])

  const updateCustomTemplate = useCallback((id: string, updates: Partial<SessionTemplate>) => {
    setCustomTemplates(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...updates } : t)
      saveCustomTemplates(updated)
      toast.success('Template updated!')
      return updated
    })
  }, [])

  const deleteCustomTemplate = useCallback((id: string) => {
    setCustomTemplates(prev => {
      const template = prev.find(t => t.id === id)
      const updated = prev.filter(t => t.id !== id)
      saveCustomTemplates(updated)
      if (template) toast.success(`Template "${template.name}" deleted`)
      return updated
    })
  }, [])

  const getAllTemplates = useCallback((): SessionTemplate[] => {
    // Return built-in templates first, then custom templates
    return [...sessionTemplates, ...customTemplates]
  }, [customTemplates])

  // ==========================================
  // CONTEXT VALUE
  // ==========================================

  const value: SessionsContextValue = {
    // State
    sessions: state.sessions,
    currentSession: state.currentSession,
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    isGenerating: state.isGenerating,
    error: state.error,

    // Templates
    templates: sessionTemplates,
    getTemplate,

    // Custom templates
    customTemplates,
    addCustomTemplate,
    updateCustomTemplate,
    deleteCustomTemplate,
    getAllTemplates,

    // Session actions
    loadSessions,
    createSession,
    loadSession,
    updateSession,
    deleteSession,
    clearCurrentSession,

    // Asset actions
    updateAsset,
    skipAsset,
    markAssetGenerating,
    markAssetCompleted,
    markAssetFailed,

    // Progress helpers
    getSessionProgress,
    isSessionComplete,
    getNextPendingAsset,
    getAssetTemplate,
  }

  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>
}

// ============================================
// HOOK
// ============================================

export function useSessions() {
  const context = useContext(SessionsContext)
  if (!context) {
    throw new Error('useSessions must be used within a SessionsProvider')
  }
  return context
}
