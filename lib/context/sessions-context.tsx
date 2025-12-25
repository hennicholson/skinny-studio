'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect } from 'react'
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
// STORAGE HELPERS
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

  // Templates (from static file)
  templates: SessionTemplate[]
  getTemplate: (id: string) => SessionTemplate | undefined

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

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionsReducer, initialState)

  // Load sessions from storage on mount
  useEffect(() => {
    const sessions = loadFromStorage()
    dispatch({ type: 'SET_SESSIONS', payload: sessions })
  }, [])

  // Save sessions to storage on change
  useEffect(() => {
    if (state.sessions.length > 0) {
      saveToStorage(state.sessions)
    }
  }, [state.sessions])

  // ==========================================
  // SESSION ACTIONS
  // ==========================================

  const loadSessions = useCallback(() => {
    dispatch({ type: 'SET_LOADING', payload: true })
    const sessions = loadFromStorage()
    dispatch({ type: 'SET_SESSIONS', payload: sessions })
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
  }, [])

  const deleteSession = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SESSION', payload: id })
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

  const getAssetTemplate = useCallback((asset: SessionAsset): SessionAssetTemplate | undefined => {
    const session = state.currentSession
    if (!session) return undefined

    const template = getSessionTemplate(session.templateId)
    if (!template) return undefined

    return template.assets.find(a => a.id === asset.templateAssetId)
  }, [state.currentSession])

  const getTemplate = useCallback((id: string): SessionTemplate | undefined => {
    return getSessionTemplate(id)
  }, [])

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
