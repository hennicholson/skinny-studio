'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect, useState } from 'react'

// Types
export type FolderType = 'general' | 'character' | 'world' | 'object' | 'style'

export interface Folder {
  id: string
  whop_user_id: string
  name: string
  icon: string
  color: string | null
  sort_order: number
  generation_count: number
  folder_type: FolderType
  created_at: string
  updated_at: string
}

interface FolderState {
  folders: Folder[]
  activeFolder: string | null  // null = Desktop (unfiled items)
  isLoading: boolean
  error: string | null
  unfiledCount: number
}

type FolderAction =
  | { type: 'SET_FOLDERS'; payload: { folders: Folder[]; unfiledCount: number } }
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'UPDATE_FOLDER'; payload: { id: string; updates: Partial<Folder> } }
  | { type: 'DELETE_FOLDER'; payload: string }
  | { type: 'SET_ACTIVE_FOLDER'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_COUNTS'; payload: { folderId: string | null; delta: number } }

const initialState: FolderState = {
  folders: [],
  activeFolder: null,
  isLoading: false,
  error: null,
  unfiledCount: 0,
}

function folderReducer(state: FolderState, action: FolderAction): FolderState {
  switch (action.type) {
    case 'SET_FOLDERS':
      return {
        ...state,
        folders: action.payload.folders,
        unfiledCount: action.payload.unfiledCount,
        isLoading: false,
        error: null,
      }

    case 'ADD_FOLDER':
      return {
        ...state,
        folders: [...state.folders, action.payload],
      }

    case 'UPDATE_FOLDER':
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.payload.id ? { ...f, ...action.payload.updates } : f
        ),
      }

    case 'DELETE_FOLDER':
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.payload),
        // If deleted folder was active, switch to desktop
        activeFolder: state.activeFolder === action.payload ? null : state.activeFolder,
      }

    case 'SET_ACTIVE_FOLDER':
      return {
        ...state,
        activeFolder: action.payload,
      }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }

    case 'UPDATE_COUNTS':
      // Update counts when item moves between folders
      const { folderId, delta } = action.payload
      if (folderId === null) {
        // Update unfiled count
        return { ...state, unfiledCount: Math.max(0, state.unfiledCount + delta) }
      }
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === folderId
            ? { ...f, generation_count: Math.max(0, f.generation_count + delta) }
            : f
        ),
      }

    default:
      return state
  }
}

// Context interface
interface FolderContextValue {
  // State
  folders: Folder[]
  activeFolder: string | null
  isLoading: boolean
  error: string | null
  unfiledCount: number

  // Actions
  setActiveFolder: (id: string | null) => void
  createFolder: (name: string, icon?: string, color?: string, folderType?: FolderType) => Promise<Folder | null>
  renameFolder: (id: string, name: string) => Promise<boolean>
  updateFolder: (id: string, updates: Partial<Folder>) => Promise<boolean>
  deleteFolder: (id: string) => Promise<boolean>
  refreshFolders: () => Promise<void>

  // For drag-drop to update counts optimistically
  updateFolderCounts: (fromFolderId: string | null, toFolderId: string | null) => void
}

const FolderContext = createContext<FolderContextValue | null>(null)

// Provider
export function FolderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(folderReducer, initialState)

  // Helper to build auth headers for dev mode
  const getAuthHeaders = useCallback((): Record<string, string> => {
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

    return headers
  }, [])

  // Fetch folders on mount
  const refreshFolders = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      const res = await fetch('/api/folders', { headers: getAuthHeaders() })
      if (!res.ok) {
        if (res.status === 401) {
          // Not authenticated yet, just set empty
          dispatch({
            type: 'SET_FOLDERS',
            payload: { folders: [], unfiledCount: 0 },
          })
          return
        }
        throw new Error('Failed to fetch folders')
      }

      const data = await res.json()
      dispatch({
        type: 'SET_FOLDERS',
        payload: {
          folders: data.folders || [],
          unfiledCount: data.unfiled_count || 0,
        },
      })
    } catch (error) {
      console.error('Error fetching folders:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load folders' })
    }
  }, [getAuthHeaders])

  // Load folders on mount
  useEffect(() => {
    refreshFolders()
  }, [refreshFolders])

  const setActiveFolder = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_FOLDER', payload: id })
  }, [])

  const createFolder = useCallback(async (name: string, icon?: string, color?: string, folderType?: FolderType): Promise<Folder | null> => {
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, icon, color, folder_type: folderType || 'general' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create folder')
      }

      const { folder } = await res.json()
      dispatch({ type: 'ADD_FOLDER', payload: folder })
      return folder
    } catch (error) {
      console.error('Error creating folder:', error)
      return null
    }
  }, [getAuthHeaders])

  const renameFolder = useCallback(async (id: string, name: string): Promise<boolean> => {
    try {
      // Optimistic update
      dispatch({ type: 'UPDATE_FOLDER', payload: { id, updates: { name } } })

      const res = await fetch(`/api/folders/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name }),
      })

      if (!res.ok) {
        // Revert on failure
        refreshFolders()
        return false
      }

      return true
    } catch (error) {
      console.error('Error renaming folder:', error)
      refreshFolders()
      return false
    }
  }, [refreshFolders, getAuthHeaders])

  const updateFolder = useCallback(async (id: string, updates: Partial<Folder>): Promise<boolean> => {
    try {
      dispatch({ type: 'UPDATE_FOLDER', payload: { id, updates } })

      const res = await fetch(`/api/folders/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        refreshFolders()
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating folder:', error)
      refreshFolders()
      return false
    }
  }, [refreshFolders, getAuthHeaders])

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Get folder count for unfiled update
      const folder = state.folders.find((f) => f.id === id)
      const itemCount = folder?.generation_count || 0

      // Optimistic update
      dispatch({ type: 'DELETE_FOLDER', payload: id })
      // Items become unfiled
      dispatch({ type: 'UPDATE_COUNTS', payload: { folderId: null, delta: itemCount } })

      const res = await fetch(`/api/folders/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        refreshFolders()
        return false
      }

      return true
    } catch (error) {
      console.error('Error deleting folder:', error)
      refreshFolders()
      return false
    }
  }, [state.folders, refreshFolders, getAuthHeaders])

  const updateFolderCounts = useCallback((fromFolderId: string | null, toFolderId: string | null) => {
    // Decrement source folder count
    dispatch({ type: 'UPDATE_COUNTS', payload: { folderId: fromFolderId, delta: -1 } })
    // Increment target folder count
    dispatch({ type: 'UPDATE_COUNTS', payload: { folderId: toFolderId, delta: 1 } })
  }, [])

  const value: FolderContextValue = {
    folders: state.folders,
    activeFolder: state.activeFolder,
    isLoading: state.isLoading,
    error: state.error,
    unfiledCount: state.unfiledCount,
    setActiveFolder,
    createFolder,
    renameFolder,
    updateFolder,
    deleteFolder,
    refreshFolders,
    updateFolderCounts,
  }

  return <FolderContext.Provider value={value}>{children}</FolderContext.Provider>
}

// Hook
export function useFolders() {
  const context = useContext(FolderContext)
  if (!context) {
    throw new Error('useFolders must be used within a FolderProvider')
  }
  return context
}
