'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { Generation } from '@/lib/types'
import { mockGenerations } from '@/lib/types'
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from '@/lib/storage'

// ============================================
// Generation Context - Manage Generations
// ============================================

interface GenerationContextType {
  // Generations
  generations: Generation[]
  isGenerating: boolean

  // Actions
  addGeneration: (generation: Generation) => void
  updateGeneration: (id: string, updates: Partial<Generation>) => void
  deleteGeneration: (id: string) => void
  togglePublic: (id: string) => void

  // Current generation state
  currentPrompt: string
  setCurrentPrompt: (prompt: string) => void
  attachedImages: File[]
  setAttachedImages: (images: File[]) => void
  addAttachedImage: (image: File) => void
  removeAttachedImage: (index: number) => void
  clearAttachedImages: () => void

  // Generation control
  setIsGenerating: (generating: boolean) => void

  // Mock generations (for gallery)
  allGenerations: Generation[]
}

const GenerationContext = createContext<GenerationContextType | null>(null)

export function GenerationProvider({ children }: { children: ReactNode }) {
  // Generations state
  const [generations, setGenerations] = useState<Generation[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  // Current input state
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [attachedImages, setAttachedImages] = useState<File[]>([])

  // Load generations from storage on mount
  useEffect(() => {
    const saved = loadFromStorage<Generation[]>(STORAGE_KEYS.GENERATIONS)
    if (saved && saved.length > 0) {
      setGenerations(saved)
    }
  }, [])

  // Save generations to storage when changed
  useEffect(() => {
    if (generations.length > 0) {
      saveToStorage(STORAGE_KEYS.GENERATIONS, generations)
    }
  }, [generations])

  // Add generation
  const addGeneration = useCallback((generation: Generation) => {
    setGenerations(prev => [generation, ...prev])
  }, [])

  // Update generation
  const updateGeneration = useCallback((id: string, updates: Partial<Generation>) => {
    setGenerations(prev => prev.map(gen =>
      gen.id === id ? { ...gen, ...updates, updatedAt: new Date() } : gen
    ))
  }, [])

  // Delete generation
  const deleteGeneration = useCallback((id: string) => {
    setGenerations(prev => prev.filter(gen => gen.id !== id))
  }, [])

  // Toggle public status
  const togglePublic = useCallback((id: string) => {
    setGenerations(prev => prev.map(gen =>
      gen.id === id ? { ...gen, isPublic: !gen.isPublic, updatedAt: new Date() } : gen
    ))
  }, [])

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

  // Combine user generations with mock for gallery
  const allGenerations = [...generations, ...mockGenerations]

  const value: GenerationContextType = {
    generations,
    isGenerating,
    addGeneration,
    updateGeneration,
    deleteGeneration,
    togglePublic,
    currentPrompt,
    setCurrentPrompt,
    attachedImages,
    setAttachedImages,
    addAttachedImage,
    removeAttachedImage,
    clearAttachedImages,
    setIsGenerating,
    allGenerations,
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
