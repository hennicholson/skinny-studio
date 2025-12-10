'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { X, Search, Sparkles, Zap, Image, Video, Check, Clock, ChevronRight } from 'lucide-react'
import { AIModel } from '@/lib/mock-data'

interface ModelSelectorProps {
  isOpen: boolean
  onClose: () => void
  models: AIModel[]
  selectedModelId: string
  onSelectModel: (modelId: string) => void
  recentModelIds?: string[]
  onModelSelected?: (model: AIModel) => void
}

export function ModelSelector({
  isOpen,
  onClose,
  models,
  selectedModelId,
  onSelectModel,
  recentModelIds = [],
  onModelSelected,
}: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'image' | 'video'>('all')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [isSelecting, setIsSelecting] = useState(false)
  const [mounted, setMounted] = useState(false)

  const drawerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Only render portal on client side
  useEffect(() => {
    setMounted(true)
  }, [])
  const modelButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Computed values - declare BEFORE useEffects that use them
  const filteredModels = models.filter(model => {
    const matchesSearch = model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         model.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         model.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = categoryFilter === 'all' || model.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  // Get recent models
  const recentModels = recentModelIds
    .map(id => models.find(m => m.id === id))
    .filter((m): m is AIModel => m !== undefined)
    .slice(0, 3)

  const getModelIcon = (model: AIModel) => {
    if (model.category === 'video') return Video
    if (model.tags.includes('fast') || model.tags.includes('fastest')) return Zap
    return Image
  }

  const setModelButtonRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) {
      modelButtonRefs.current.set(id, el)
    } else {
      modelButtonRefs.current.delete(id)
    }
  }, [])

  const handleSelectModel = useCallback((model: AIModel) => {
    setIsSelecting(true)
    onSelectModel(model.id)
    onModelSelected?.(model)

    // Brief delay before closing for selection feedback
    setTimeout(() => {
      onClose()
      setIsSelecting(false)
    }, 150)
  }, [onSelectModel, onModelSelected, onClose])

  // Reset state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setCategoryFilter('all')
      setFocusedIndex(-1)
      setIsSelecting(false)
      // Focus search input after animation starts
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex(prev =>
            prev < filteredModels.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex(prev => prev > 0 ? prev - 1 : prev)
          break
        case 'Enter':
          e.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < filteredModels.length) {
            handleSelectModel(filteredModels[focusedIndex])
          }
          break
        case 'PageDown':
          e.preventDefault()
          setFocusedIndex(prev =>
            Math.min(prev + 5, filteredModels.length - 1)
          )
          break
        case 'PageUp':
          e.preventDefault()
          setFocusedIndex(prev => Math.max(prev - 5, 0))
          break
        case 'Home':
          e.preventDefault()
          setFocusedIndex(0)
          break
        case 'End':
          e.preventDefault()
          setFocusedIndex(filteredModels.length - 1)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, focusedIndex, filteredModels, handleSelectModel])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && filteredModels[focusedIndex]) {
      const button = modelButtonRefs.current.get(filteredModels[focusedIndex].id)
      button?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedIndex, filteredModels])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Don't render until mounted (client-side only for portal)
  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            aria-hidden="true"
          />

          {/* Sidebar Drawer */}
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-selector-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            className="fixed inset-y-0 right-0 w-full sm:w-[400px] max-w-full bg-zinc-900 border-l border-zinc-800 z-[100] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-skinny-yellow" />
                <h2 id="model-selector-title" className="text-base font-bold uppercase tracking-wide">Select Model</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                aria-label="Close model selector"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setFocusedIndex(0)
                  }}
                  placeholder="Search models..."
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-skinny-yellow/50 transition-colors"
                  aria-label="Search models"
                />
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-800">
              <div className="flex gap-1" role="tablist" aria-label="Filter by category">
                {(['all', 'image', 'video'] as const).map((cat) => (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={categoryFilter === cat}
                    onClick={() => {
                      setCategoryFilter(cat)
                      setFocusedIndex(0)
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all",
                      categoryFilter === cat
                        ? "bg-skinny-yellow text-black"
                        : "bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Content */}
            <div ref={listRef} className="flex-1 overflow-y-auto" role="listbox" aria-label="Available models">
              {/* Recent Models */}
              {recentModels.length > 0 && !searchQuery && categoryFilter === 'all' && (
                <div className="px-4 py-3 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={12} className="text-zinc-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Recent</span>
                  </div>
                  <div className="space-y-0.5">
                    {recentModels.map((model) => {
                      const Icon = getModelIcon(model)
                      const isSelected = model.id === selectedModelId

                      return (
                        <button
                          key={`recent-${model.id}`}
                          onClick={() => handleSelectModel(model)}
                          className={cn(
                            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-all",
                            isSelected
                              ? "bg-skinny-yellow/10 text-skinny-yellow"
                              : "text-zinc-300 hover:bg-zinc-800"
                          )}
                        >
                          <Icon size={14} className={isSelected ? "text-skinny-yellow" : "text-zinc-500"} />
                          <span className="flex-1 text-sm font-medium truncate">{model.name}</span>
                          {isSelected && <Check size={14} className="text-skinny-yellow flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* All Models List */}
              <div className="px-4 py-3">
                {!searchQuery && categoryFilter === 'all' && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">All Models</span>
                    <span className="text-[10px] text-zinc-600">({filteredModels.length})</span>
                  </div>
                )}

                <div className="space-y-0.5">
                  {filteredModels.map((model, index) => {
                    const Icon = getModelIcon(model)
                    const isSelected = model.id === selectedModelId
                    const isFocused = focusedIndex === index

                    return (
                      <button
                        key={model.id}
                        ref={(el) => setModelButtonRef(model.id, el)}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectModel(model)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        className={cn(
                          "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-all",
                          isSelected
                            ? "bg-skinny-yellow/10"
                            : isFocused
                            ? "bg-zinc-800"
                            : "hover:bg-zinc-800/50"
                        )}
                      >
                        <div className={cn(
                          "p-1.5 rounded-md transition-colors flex-shrink-0",
                          isSelected ? "bg-skinny-yellow/20" : "bg-zinc-700/50"
                        )}>
                          <Icon size={14} className={isSelected ? "text-skinny-yellow" : "text-zinc-400"} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "text-sm font-medium truncate",
                            isSelected ? "text-skinny-yellow" : "text-white"
                          )}>
                            {model.name}
                          </div>
                          <div className="text-xs text-zinc-500 truncate">
                            {model.provider}
                          </div>
                        </div>

                        {/* Tags - show first two */}
                        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                          {model.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                isSelected
                                  ? "bg-skinny-yellow/20 text-skinny-yellow"
                                  : "bg-zinc-700/50 text-zinc-500"
                              )}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {isSelected && (
                          <Check size={14} className="text-skinny-yellow flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>

                {filteredModels.length === 0 && (
                  <div className="text-center py-8 text-zinc-500" role="status">
                    <p className="text-sm">No models found</p>
                    <p className="text-xs mt-1">Try a different search term</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-2 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">↑↓</kbd> Navigate</span>
                <span><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">⏎</kbd> Select</span>
                <span><kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">Esc</kbd> Close</span>
              </div>
              <span className="text-zinc-600">{filteredModels.length} models</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
