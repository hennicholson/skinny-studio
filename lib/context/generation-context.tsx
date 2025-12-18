'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react'
import { useUser } from './user-context'

// ============================================
// Generation Context - Database-First Approach
// ============================================

// Generation type matching the database schema
export interface Generation {
  id: string
  whop_user_id?: string
  user_id?: string
  model_id?: string
  model_slug: string
  model_category: string
  conversation_id?: string
  message_id?: string
  prompt: string
  output_urls: string[]
  parameters?: Record<string, any>
  cost_cents?: number
  replicate_status?: string
  created_at: string
  completed_at?: string
  folder_id?: string | null  // Library folder organization
  studio_models?: {
    id: string
    slug: string
    name: string
    category: string
  }
  // Legacy fields for UI compatibility
  isPublic?: boolean
}

interface GenerationContextType {
  // Generations from database
  generations: Generation[]
  isLoading: boolean
  error: string | null

  // Actions
  addGeneration: (generation: Generation) => void
  updateGeneration: (id: string, updates: Partial<Generation>) => void
  deleteGeneration: (id: string) => void
  refreshGenerations: () => Promise<void>
  moveGeneration: (id: string, folderId: string | null) => Promise<boolean>

  // Current generation state (for input UI)
  currentPrompt: string
  setCurrentPrompt: (prompt: string) => void
  attachedImages: File[]
  setAttachedImages: (images: File[]) => void
  addAttachedImage: (image: File) => void
  removeAttachedImage: (index: number) => void
  clearAttachedImages: () => void

  // Generation control
  isGenerating: boolean
  setIsGenerating: (generating: boolean) => void

  // All generations (for gallery - user's generations only)
  allGenerations: Generation[]

  // Folder-filtered views
  getUnfiledGenerations: () => Generation[]
  getGenerationsByFolder: (folderId: string) => Generation[]
}

const GenerationContext = createContext<GenerationContextType | null>(null)

export function GenerationProvider({ children }: { children: ReactNode }) {
  // Get user context to check authentication
  const { user, isLoading: userLoading } = useUser()
  const isAuthenticated = !!user

  // Generations state - fetched from API
  const [generations, setGenerations] = useState<Generation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Current input state (for UI)
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [attachedImages, setAttachedImages] = useState<File[]>([])

  // Fetch generations from API
  const refreshGenerations = useCallback(async () => {
    if (!isAuthenticated) {
      setGenerations([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Build headers for Whop auth (dev mode support)
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

      const res = await fetch('/api/generations?limit=100', { headers })

      if (res.ok) {
        const data = await res.json()
        setGenerations(data.generations || [])
      } else if (res.status === 401) {
        setError('Sign in to view your generations')
        setGenerations([])
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.error || 'Failed to fetch generations')
      }
    } catch (err) {
      console.error('Failed to fetch generations:', err)
      setError('Failed to load generations')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  // Fetch generations when user changes or on mount
  useEffect(() => {
    if (!userLoading) {
      refreshGenerations()
    }
  }, [isAuthenticated, userLoading, refreshGenerations])

  // Add generation (optimistically add to local state)
  const addGeneration = useCallback((generation: Generation) => {
    setGenerations(prev => [generation, ...prev])
  }, [])

  // Update generation
  const updateGeneration = useCallback((id: string, updates: Partial<Generation>) => {
    setGenerations(prev => prev.map(gen =>
      gen.id === id ? { ...gen, ...updates } : gen
    ))
  }, [])

  // Delete generation (optimistic - also call API if needed)
  const deleteGeneration = useCallback((id: string) => {
    setGenerations(prev => prev.filter(gen => gen.id !== id))
  }, [])

  // Move generation to a folder
  const moveGeneration = useCallback(async (id: string, folderId: string | null): Promise<boolean> => {
    // Get current folder for rollback
    const gen = generations.find(g => g.id === id)
    const previousFolderId = gen?.folder_id

    // Optimistic update
    setGenerations(prev => prev.map(g =>
      g.id === id ? { ...g, folder_id: folderId } : g
    ))

    try {
      // Build headers for Whop auth (dev mode support)
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

      const res = await fetch(`/api/generations/${id}/move`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ folder_id: folderId }),
      })

      if (!res.ok) {
        // Revert on failure
        setGenerations(prev => prev.map(g =>
          g.id === id ? { ...g, folder_id: previousFolderId } : g
        ))
        return false
      }

      return true
    } catch (error) {
      console.error('Error moving generation:', error)
      // Revert on failure
      setGenerations(prev => prev.map(g =>
        g.id === id ? { ...g, folder_id: previousFolderId } : g
      ))
      return false
    }
  }, [generations])

  // Get unfiled generations (desktop)
  const getUnfiledGenerations = useCallback(() => {
    return generations.filter(g =>
      !g.folder_id &&
      g.replicate_status === 'succeeded' &&
      g.output_urls &&
      g.output_urls.length > 0
    )
  }, [generations])

  // Get generations by folder
  const getGenerationsByFolder = useCallback((folderId: string) => {
    return generations.filter(g =>
      g.folder_id === folderId &&
      g.replicate_status === 'succeeded' &&
      g.output_urls &&
      g.output_urls.length > 0
    )
  }, [generations])

  // Add attached image
  const addAttachedImage = useCallback((image: File) => {
    setAttachedImages(prev => {
      if (prev.length >= 4) return prev // Max 4 images
      return [...prev, image]
    })
  }, [])

  // Remove attached image
  const removeAttachedImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Clear attached images
  const clearAttachedImages = useCallback(() => {
    setAttachedImages([])
  }, [])

  // All generations for gallery - filter to only show completed ones with actual images
  // This is a safety filter in case the API returns pending generations
  const allGenerations = useMemo(() =>
    generations.filter(g =>
      g.replicate_status === 'succeeded' &&
      g.output_urls &&
      g.output_urls.length > 0
    ),
    [generations]
  )

  const value: GenerationContextType = {
    generations,
    isLoading,
    error,
    addGeneration,
    updateGeneration,
    deleteGeneration,
    refreshGenerations,
    moveGeneration,
    currentPrompt,
    setCurrentPrompt,
    attachedImages,
    setAttachedImages,
    addAttachedImage,
    removeAttachedImage,
    clearAttachedImages,
    isGenerating,
    setIsGenerating,
    allGenerations,
    getUnfiledGenerations,
    getGenerationsByFolder,
  }

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  )
}

export function useGeneration() {
  const context = useContext(GenerationContext)
  if (!context) {
    throw new Error('useGeneration must be used within a GenerationProvider')
  }
  return context
}
