'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

export interface SavedPrompt {
  id: string
  whop_user_id: string
  title: string
  prompt: string
  description: string | null
  target_model: string | null
  category: string
  tags: string[]
  skill_shortcuts: string[]
  is_favorite: boolean
  use_count: number
  created_at: string
  updated_at: string
}

interface SavedPromptsContextType {
  prompts: SavedPrompt[]
  isLoading: boolean
  error: string | null
  refreshPrompts: () => Promise<void>
  savePrompt: (data: {
    title?: string
    prompt: string
    description?: string
    target_model?: string
    category?: string
    tags?: string[]
    skill_shortcuts?: string[]
  }) => Promise<SavedPrompt | null>
  updatePrompt: (id: string, updates: Partial<SavedPrompt>) => Promise<SavedPrompt | null>
  deletePrompt: (id: string) => Promise<boolean>
  toggleFavorite: (id: string) => Promise<void>
  incrementUseCount: (id: string) => Promise<void>
  copyPromptToClipboard: (prompt: SavedPrompt) => Promise<void>
}

const SavedPromptsContext = createContext<SavedPromptsContextType | null>(null)

export function SavedPromptsProvider({ children }: { children: ReactNode }) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build auth headers
  const getAuthHeaders = useCallback(() => {
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

  // Fetch all prompts
  const refreshPrompts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/saved-prompts', {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        throw new Error('Failed to fetch prompts')
      }
      const data = await response.json()
      setPrompts(data.prompts || [])
    } catch (err) {
      console.error('Error fetching saved prompts:', err)
      setError('Failed to load saved prompts')
    } finally {
      setIsLoading(false)
    }
  }, [getAuthHeaders])

  // Load prompts on mount
  useEffect(() => {
    refreshPrompts()
  }, [refreshPrompts])

  // Save a new prompt
  const savePrompt = useCallback(async (data: {
    title?: string
    prompt: string
    description?: string
    target_model?: string
    category?: string
    tags?: string[]
    skill_shortcuts?: string[]
  }): Promise<SavedPrompt | null> => {
    try {
      const response = await fetch('/api/saved-prompts', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        throw new Error('Failed to save prompt')
      }
      const result = await response.json()
      if (result.prompt) {
        setPrompts(prev => [result.prompt, ...prev])
        return result.prompt
      }
      return null
    } catch (err) {
      console.error('Error saving prompt:', err)
      return null
    }
  }, [getAuthHeaders])

  // Update a prompt
  const updatePrompt = useCallback(async (id: string, updates: Partial<SavedPrompt>): Promise<SavedPrompt | null> => {
    try {
      const response = await fetch('/api/saved-prompts', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id, ...updates }),
      })
      if (!response.ok) {
        throw new Error('Failed to update prompt')
      }
      const result = await response.json()
      if (result.prompt) {
        setPrompts(prev => prev.map(p => p.id === id ? result.prompt : p))
        return result.prompt
      }
      return null
    } catch (err) {
      console.error('Error updating prompt:', err)
      return null
    }
  }, [getAuthHeaders])

  // Delete a prompt
  const deletePrompt = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/saved-prompts?id=${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        throw new Error('Failed to delete prompt')
      }
      setPrompts(prev => prev.filter(p => p.id !== id))
      return true
    } catch (err) {
      console.error('Error deleting prompt:', err)
      return false
    }
  }, [getAuthHeaders])

  // Toggle favorite
  const toggleFavorite = useCallback(async (id: string) => {
    const prompt = prompts.find(p => p.id === id)
    if (!prompt) return
    await updatePrompt(id, { is_favorite: !prompt.is_favorite })
  }, [prompts, updatePrompt])

  // Increment use count
  const incrementUseCount = useCallback(async (id: string) => {
    const prompt = prompts.find(p => p.id === id)
    if (!prompt) return
    await updatePrompt(id, { use_count: prompt.use_count + 1 })
  }, [prompts, updatePrompt])

  // Copy prompt to clipboard
  const copyPromptToClipboard = useCallback(async (prompt: SavedPrompt) => {
    try {
      await navigator.clipboard.writeText(prompt.prompt)
      await incrementUseCount(prompt.id)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }, [incrementUseCount])

  return (
    <SavedPromptsContext.Provider value={{
      prompts,
      isLoading,
      error,
      refreshPrompts,
      savePrompt,
      updatePrompt,
      deletePrompt,
      toggleFavorite,
      incrementUseCount,
      copyPromptToClipboard,
    }}>
      {children}
    </SavedPromptsContext.Provider>
  )
}

export function useSavedPrompts() {
  const context = useContext(SavedPromptsContext)
  if (!context) {
    throw new Error('useSavedPrompts must be used within a SavedPromptsProvider')
  }
  return context
}
