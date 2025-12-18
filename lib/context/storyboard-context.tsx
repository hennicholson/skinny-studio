'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect } from 'react'
import type {
  Storyboard,
  StoryboardShot,
  StoryboardEntity,
  CreateStoryboardInput,
  UpdateStoryboardInput,
  CreateShotInput,
  UpdateShotInput,
  CreateEntityInput,
  EntityType,
  ShotEntityReference,
} from '@/lib/types'

// ============================================
// STATE TYPES
// ============================================

interface StoryboardState {
  // Storyboards list
  storyboards: Storyboard[]
  currentStoryboard: Storyboard | null

  // Current storyboard data
  shots: StoryboardShot[]
  entities: StoryboardEntity[]

  // Loading states
  isLoading: boolean
  isSaving: boolean
  isGenerating: string | null // Shot ID being generated

  // Errors
  error: string | null
}

type StoryboardAction =
  | { type: 'SET_STORYBOARDS'; payload: Storyboard[] }
  | { type: 'SET_CURRENT_STORYBOARD'; payload: Storyboard | null }
  | { type: 'ADD_STORYBOARD'; payload: Storyboard }
  | { type: 'UPDATE_STORYBOARD'; payload: { id: string; updates: Partial<Storyboard> } }
  | { type: 'DELETE_STORYBOARD'; payload: string }
  | { type: 'SET_SHOTS'; payload: StoryboardShot[] }
  | { type: 'ADD_SHOT'; payload: StoryboardShot }
  | { type: 'ADD_SHOTS'; payload: StoryboardShot[] }
  | { type: 'UPDATE_SHOT'; payload: { id: string; updates: Partial<StoryboardShot> } }
  | { type: 'DELETE_SHOT'; payload: string }
  | { type: 'REORDER_SHOTS'; payload: string[] }
  | { type: 'SET_ENTITIES'; payload: StoryboardEntity[] }
  | { type: 'ADD_ENTITY'; payload: StoryboardEntity }
  | { type: 'UPDATE_ENTITY'; payload: { id: string; updates: Partial<StoryboardEntity> } }
  | { type: 'DELETE_ENTITY'; payload: string }
  | { type: 'ADD_SHOT_ENTITY'; payload: { shotId: string; entity: ShotEntityReference } }
  | { type: 'REMOVE_SHOT_ENTITY'; payload: { shotId: string; entityId: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_GENERATING'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_CURRENT' }

const initialState: StoryboardState = {
  storyboards: [],
  currentStoryboard: null,
  shots: [],
  entities: [],
  isLoading: false,
  isSaving: false,
  isGenerating: null,
  error: null,
}

// ============================================
// REDUCER
// ============================================

function storyboardReducer(state: StoryboardState, action: StoryboardAction): StoryboardState {
  switch (action.type) {
    case 'SET_STORYBOARDS':
      return { ...state, storyboards: action.payload, isLoading: false }

    case 'SET_CURRENT_STORYBOARD':
      return { ...state, currentStoryboard: action.payload, isLoading: false }

    case 'ADD_STORYBOARD':
      return { ...state, storyboards: [action.payload, ...state.storyboards] }

    case 'UPDATE_STORYBOARD':
      return {
        ...state,
        storyboards: state.storyboards.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
        currentStoryboard: state.currentStoryboard?.id === action.payload.id
          ? { ...state.currentStoryboard, ...action.payload.updates }
          : state.currentStoryboard,
      }

    case 'DELETE_STORYBOARD':
      return {
        ...state,
        storyboards: state.storyboards.filter(s => s.id !== action.payload),
        currentStoryboard: state.currentStoryboard?.id === action.payload
          ? null
          : state.currentStoryboard,
      }

    case 'SET_SHOTS':
      return { ...state, shots: action.payload }

    case 'ADD_SHOT':
      return { ...state, shots: [...state.shots, action.payload] }

    case 'ADD_SHOTS':
      return { ...state, shots: [...state.shots, ...action.payload] }

    case 'UPDATE_SHOT':
      return {
        ...state,
        shots: state.shots.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      }

    case 'DELETE_SHOT':
      return { ...state, shots: state.shots.filter(s => s.id !== action.payload) }

    case 'REORDER_SHOTS': {
      const orderedIds = action.payload
      const orderedShots = orderedIds.map((id, index) => {
        const shot = state.shots.find(s => s.id === id)
        return shot ? { ...shot, sortOrder: index, shotNumber: index + 1 } : null
      }).filter(Boolean) as StoryboardShot[]
      return { ...state, shots: orderedShots }
    }

    case 'SET_ENTITIES':
      return { ...state, entities: action.payload }

    case 'ADD_ENTITY':
      return { ...state, entities: [...state.entities, action.payload] }

    case 'UPDATE_ENTITY':
      return {
        ...state,
        entities: state.entities.map(e =>
          e.id === action.payload.id ? { ...e, ...action.payload.updates } : e
        ),
      }

    case 'DELETE_ENTITY':
      return { ...state, entities: state.entities.filter(e => e.id !== action.payload) }

    case 'ADD_SHOT_ENTITY': {
      const { shotId, entity } = action.payload
      return {
        ...state,
        shots: state.shots.map(s => {
          if (s.id === shotId) {
            const existingEntities = s.entities || []
            return { ...s, entities: [...existingEntities, entity] }
          }
          return s
        }),
      }
    }

    case 'REMOVE_SHOT_ENTITY': {
      const { shotId, entityId } = action.payload
      return {
        ...state,
        shots: state.shots.map(s => {
          if (s.id === shotId && s.entities) {
            return { ...s, entities: s.entities.filter(e => e.entityId !== entityId) }
          }
          return s
        }),
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
      return { ...state, currentStoryboard: null, shots: [], entities: [] }

    default:
      return state
  }
}

// ============================================
// CONTEXT INTERFACE
// ============================================

interface StoryboardContextValue {
  // State
  storyboards: Storyboard[]
  currentStoryboard: Storyboard | null
  shots: StoryboardShot[]
  entities: StoryboardEntity[]
  isLoading: boolean
  isSaving: boolean
  isGenerating: string | null
  error: string | null

  // Storyboard actions
  fetchStoryboards: () => Promise<void>
  createStoryboard: (data: CreateStoryboardInput) => Promise<Storyboard | null>
  loadStoryboard: (id: string) => Promise<void>
  updateStoryboard: (id: string, updates: UpdateStoryboardInput) => Promise<boolean>
  deleteStoryboard: (id: string) => Promise<boolean>
  clearCurrent: () => void

  // Shot actions
  addShot: (shot: CreateShotInput) => Promise<StoryboardShot | null>
  addShotsFromAI: (shots: CreateShotInput[]) => Promise<StoryboardShot[]>
  updateShot: (shotId: string, updates: UpdateShotInput) => Promise<boolean>
  deleteShot: (shotId: string) => Promise<boolean>
  reorderShots: (orderedIds: string[]) => Promise<boolean>

  // Entity actions
  addEntity: (entity: CreateEntityInput) => Promise<StoryboardEntity | null>
  updateEntity: (entityId: string, updates: Partial<StoryboardEntity>) => Promise<boolean>
  removeEntity: (entityId: string) => Promise<boolean>
  analyzeEntityImage: (entityId: string) => Promise<string | null>

  // Shot-Entity linking
  assignEntityToShot: (shotId: string, entityId: string, role?: string) => Promise<boolean>
  removeEntityFromShot: (shotId: string, entityId: string) => Promise<boolean>
  getEntitiesForShot: (shotId: string) => StoryboardEntity[]

  // Generation
  generateShot: (shotId: string) => Promise<boolean>
}

const StoryboardContext = createContext<StoryboardContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

export function StoryboardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storyboardReducer, initialState)

  // Auth headers helper
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (typeof window !== 'undefined') {
      const devToken = localStorage.getItem('whop-dev-token')
      const devUserId = localStorage.getItem('whop-dev-user-id')

      if (devToken) headers['x-whop-user-token'] = devToken
      if (devUserId) headers['x-whop-user-id'] = devUserId
    }

    return headers
  }, [])

  // ==========================================
  // STORYBOARD ACTIONS
  // ==========================================

  const fetchStoryboards = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      const res = await fetch('/api/storyboards', { headers: getAuthHeaders() })
      if (!res.ok) {
        if (res.status === 401) {
          dispatch({ type: 'SET_STORYBOARDS', payload: [] })
          return
        }
        throw new Error('Failed to fetch storyboards')
      }

      const data = await res.json()
      dispatch({ type: 'SET_STORYBOARDS', payload: data.storyboards || [] })
    } catch (error) {
      console.error('Error fetching storyboards:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load storyboards' })
    }
  }, [getAuthHeaders])

  const createStoryboard = useCallback(async (data: CreateStoryboardInput): Promise<Storyboard | null> => {
    dispatch({ type: 'SET_SAVING', payload: true })

    try {
      const res = await fetch('/api/storyboards', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create storyboard')
      }

      const { storyboard } = await res.json()
      dispatch({ type: 'ADD_STORYBOARD', payload: storyboard })
      dispatch({ type: 'SET_SAVING', payload: false })
      return storyboard
    } catch (error) {
      console.error('Error creating storyboard:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to create storyboard' })
      return null
    }
  }, [getAuthHeaders])

  const loadStoryboard = useCallback(async (id: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      const res = await fetch(`/api/storyboards/${id}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Failed to load storyboard')

      const data = await res.json()
      dispatch({ type: 'SET_CURRENT_STORYBOARD', payload: data.storyboard })
      dispatch({ type: 'SET_SHOTS', payload: data.shots || [] })
      dispatch({ type: 'SET_ENTITIES', payload: data.entities || [] })
    } catch (error) {
      console.error('Error loading storyboard:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load storyboard' })
    }
  }, [getAuthHeaders])

  const updateStoryboard = useCallback(async (id: string, updates: UpdateStoryboardInput): Promise<boolean> => {
    // Optimistic update
    dispatch({ type: 'UPDATE_STORYBOARD', payload: { id, updates } })
    dispatch({ type: 'SET_SAVING', payload: true })

    try {
      const res = await fetch(`/api/storyboards/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      })

      dispatch({ type: 'SET_SAVING', payload: false })

      if (!res.ok) {
        await fetchStoryboards()
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating storyboard:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to update storyboard' })
      return false
    }
  }, [getAuthHeaders, fetchStoryboards])

  const deleteStoryboard = useCallback(async (id: string): Promise<boolean> => {
    dispatch({ type: 'DELETE_STORYBOARD', payload: id })

    try {
      const res = await fetch(`/api/storyboards/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        await fetchStoryboards()
        return false
      }

      return true
    } catch (error) {
      console.error('Error deleting storyboard:', error)
      await fetchStoryboards()
      return false
    }
  }, [getAuthHeaders, fetchStoryboards])

  const clearCurrent = useCallback(() => {
    dispatch({ type: 'CLEAR_CURRENT' })
  }, [])

  // ==========================================
  // SHOT ACTIONS
  // ==========================================

  const addShot = useCallback(async (shot: CreateShotInput): Promise<StoryboardShot | null> => {
    if (!state.currentStoryboard) return null

    dispatch({ type: 'SET_SAVING', payload: true })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/shots`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(shot),
      })

      if (!res.ok) throw new Error('Failed to add shot')

      const { shot: newShot } = await res.json()
      dispatch({ type: 'ADD_SHOT', payload: newShot })
      dispatch({ type: 'SET_SAVING', payload: false })
      return newShot
    } catch (error) {
      console.error('Error adding shot:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to add shot' })
      return null
    }
  }, [state.currentStoryboard, getAuthHeaders])

  const addShotsFromAI = useCallback(async (shots: CreateShotInput[]): Promise<StoryboardShot[]> => {
    if (!state.currentStoryboard) return []

    dispatch({ type: 'SET_SAVING', payload: true })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/shots`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ shots, bulk: true }),
      })

      if (!res.ok) throw new Error('Failed to add shots')

      const { shots: newShots } = await res.json()
      dispatch({ type: 'ADD_SHOTS', payload: newShots })
      dispatch({ type: 'SET_SAVING', payload: false })
      return newShots
    } catch (error) {
      console.error('Error adding shots from AI:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to add shots' })
      return []
    }
  }, [state.currentStoryboard, getAuthHeaders])

  const updateShot = useCallback(async (shotId: string, updates: UpdateShotInput): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    // Optimistic update
    dispatch({ type: 'UPDATE_SHOT', payload: { id: shotId, updates } })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/shots/${shotId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        await loadStoryboard(state.currentStoryboard.id)
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating shot:', error)
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders, loadStoryboard])

  const deleteShot = useCallback(async (shotId: string): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    dispatch({ type: 'DELETE_SHOT', payload: shotId })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/shots/${shotId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        await loadStoryboard(state.currentStoryboard.id)
        return false
      }

      return true
    } catch (error) {
      console.error('Error deleting shot:', error)
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders, loadStoryboard])

  const reorderShots = useCallback(async (orderedIds: string[]): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    // Optimistic update
    dispatch({ type: 'REORDER_SHOTS', payload: orderedIds })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/shots/reorder`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ orderedIds }),
      })

      if (!res.ok) {
        await loadStoryboard(state.currentStoryboard.id)
        return false
      }

      return true
    } catch (error) {
      console.error('Error reordering shots:', error)
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders, loadStoryboard])

  // ==========================================
  // ENTITY ACTIONS
  // ==========================================

  const addEntity = useCallback(async (entity: CreateEntityInput): Promise<StoryboardEntity | null> => {
    if (!state.currentStoryboard) return null

    dispatch({ type: 'SET_SAVING', payload: true })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/entities`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(entity),
      })

      if (!res.ok) throw new Error('Failed to add entity')

      const { entity: newEntity } = await res.json()
      dispatch({ type: 'ADD_ENTITY', payload: newEntity })
      dispatch({ type: 'SET_SAVING', payload: false })
      return newEntity
    } catch (error) {
      console.error('Error adding entity:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to add entity' })
      return null
    }
  }, [state.currentStoryboard, getAuthHeaders])

  const updateEntity = useCallback(async (entityId: string, updates: Partial<StoryboardEntity>): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    dispatch({ type: 'UPDATE_ENTITY', payload: { id: entityId, updates } })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/entities/${entityId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        await loadStoryboard(state.currentStoryboard.id)
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating entity:', error)
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders, loadStoryboard])

  const removeEntity = useCallback(async (entityId: string): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    dispatch({ type: 'DELETE_ENTITY', payload: entityId })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/entities/${entityId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        await loadStoryboard(state.currentStoryboard.id)
        return false
      }

      return true
    } catch (error) {
      console.error('Error removing entity:', error)
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders, loadStoryboard])

  const analyzeEntityImage = useCallback(async (entityId: string): Promise<string | null> => {
    if (!state.currentStoryboard) return null

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/entities/${entityId}/analyze`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error('Failed to analyze entity image')

      const { visionContext } = await res.json()
      dispatch({ type: 'UPDATE_ENTITY', payload: { id: entityId, updates: { visionContext } } })
      return visionContext
    } catch (error) {
      console.error('Error analyzing entity image:', error)
      return null
    }
  }, [state.currentStoryboard, getAuthHeaders])

  // ==========================================
  // SHOT-ENTITY LINKING
  // ==========================================

  const assignEntityToShot = useCallback(async (shotId: string, entityId: string, role?: string): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/shots/${shotId}/entities`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ entityId, role }),
      })

      if (!res.ok) throw new Error('Failed to assign entity')

      const { reference } = await res.json()
      dispatch({ type: 'ADD_SHOT_ENTITY', payload: { shotId, entity: reference } })
      return true
    } catch (error) {
      console.error('Error assigning entity to shot:', error)
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders])

  const removeEntityFromShot = useCallback(async (shotId: string, entityId: string): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    dispatch({ type: 'REMOVE_SHOT_ENTITY', payload: { shotId, entityId } })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/shots/${shotId}/entities?entityId=${entityId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        await loadStoryboard(state.currentStoryboard.id)
        return false
      }

      return true
    } catch (error) {
      console.error('Error removing entity from shot:', error)
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders, loadStoryboard])

  const getEntitiesForShot = useCallback((shotId: string): StoryboardEntity[] => {
    const shot = state.shots.find(s => s.id === shotId)
    if (!shot?.entities) return []

    return shot.entities
      .map(ref => state.entities.find(e => e.id === ref.entityId))
      .filter(Boolean) as StoryboardEntity[]
  }, [state.shots, state.entities])

  // ==========================================
  // GENERATION
  // ==========================================

  const generateShot = useCallback(async (shotId: string): Promise<boolean> => {
    if (!state.currentStoryboard) return false

    dispatch({ type: 'SET_GENERATING', payload: shotId })
    dispatch({ type: 'UPDATE_SHOT', payload: { id: shotId, updates: { status: 'generating' } } })

    try {
      const res = await fetch(`/api/storyboards/${state.currentStoryboard.id}/generate/${shotId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })

      const result = await res.json()

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Generation failed')
      }

      // If pending, we need to poll for completion
      if (result.pending) {
        // Update shot with the pending state from server
        if (result.shot) {
          dispatch({
            type: 'UPDATE_SHOT',
            payload: {
              id: shotId,
              updates: {
                status: 'generating',
                generationId: result.generationId,
              },
            },
          })
        }

        // Start polling for completion
        const pollForCompletion = async (): Promise<boolean> => {
          const maxAttempts = 120 // 2 minutes at 1s intervals
          let attempts = 0

          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            attempts++

            const pollRes = await fetch(
              `/api/storyboards/${state.currentStoryboard!.id}/generate/${shotId}`,
              { headers: getAuthHeaders() }
            )
            const pollResult = await pollRes.json()

            if (pollResult.status === 'completed') {
              dispatch({
                type: 'UPDATE_SHOT',
                payload: {
                  id: shotId,
                  updates: {
                    status: 'completed',
                    generatedImageUrl: pollResult.imageUrl,
                    generationId: pollResult.generationId,
                  },
                },
              })
              dispatch({ type: 'SET_GENERATING', payload: null })
              return true
            }

            if (pollResult.status === 'error') {
              throw new Error(pollResult.error || 'Generation failed')
            }
          }

          throw new Error('Generation timed out')
        }

        return await pollForCompletion()
      }

      // If immediately complete
      if (result.success && result.imageUrl) {
        dispatch({
          type: 'UPDATE_SHOT',
          payload: {
            id: shotId,
            updates: {
              status: 'completed',
              generatedImageUrl: result.imageUrl,
              generationId: result.generationId,
            },
          },
        })
        dispatch({ type: 'SET_GENERATING', payload: null })
        return true
      }

      throw new Error('Unexpected generation result')
    } catch (error) {
      console.error('Error generating shot:', error)
      dispatch({ type: 'UPDATE_SHOT', payload: { id: shotId, updates: { status: 'error' } } })
      dispatch({ type: 'SET_GENERATING', payload: null })
      return false
    }
  }, [state.currentStoryboard, getAuthHeaders])

  // ==========================================
  // CONTEXT VALUE
  // ==========================================

  const value: StoryboardContextValue = {
    // State
    storyboards: state.storyboards,
    currentStoryboard: state.currentStoryboard,
    shots: state.shots,
    entities: state.entities,
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    isGenerating: state.isGenerating,
    error: state.error,

    // Storyboard actions
    fetchStoryboards,
    createStoryboard,
    loadStoryboard,
    updateStoryboard,
    deleteStoryboard,
    clearCurrent,

    // Shot actions
    addShot,
    addShotsFromAI,
    updateShot,
    deleteShot,
    reorderShots,

    // Entity actions
    addEntity,
    updateEntity,
    removeEntity,
    analyzeEntityImage,

    // Shot-Entity linking
    assignEntityToShot,
    removeEntityFromShot,
    getEntitiesForShot,

    // Generation
    generateShot,
  }

  return <StoryboardContext.Provider value={value}>{children}</StoryboardContext.Provider>
}

// ============================================
// HOOK
// ============================================

export function useStoryboard() {
  const context = useContext(StoryboardContext)
  if (!context) {
    throw new Error('useStoryboard must be used within a StoryboardProvider')
  }
  return context
}
