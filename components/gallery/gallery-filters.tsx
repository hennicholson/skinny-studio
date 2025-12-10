'use client'

import { cn } from '@/lib/utils'
import { Search, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AIModel } from '@/lib/mock-data'

interface GalleryFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedModel: string | null
  onModelChange: (modelId: string | null) => void
  sortBy: 'recent' | 'popular'
  onSortChange: (sort: 'recent' | 'popular') => void
  models: AIModel[]
}

export function GalleryFilters({
  searchQuery,
  onSearchChange,
  selectedModel,
  onModelChange,
  sortBy,
  onSortChange,
  models
}: GalleryFiltersProps) {
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  const selectedModelName = selectedModel
    ? models.find(m => m.id === selectedModel)?.name || 'Unknown'
    : 'All Models'

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search prompts..."
          className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-skinny-yellow/50 transition-colors"
        />
      </div>

      {/* Model Filter */}
      <div className="relative">
        <button
          onClick={() => setShowModelDropdown(!showModelDropdown)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors min-w-[160px] justify-between",
            selectedModel
              ? "border-skinny-yellow/50 bg-skinny-yellow/10 text-white"
              : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
          )}
        >
          <span className="truncate">{selectedModelName}</span>
          <ChevronDown size={16} className={cn(
            "transition-transform",
            showModelDropdown && "rotate-180"
          )} />
        </button>

        <AnimatePresence>
          {showModelDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 top-full mt-2 bg-zinc-900 border-2 border-zinc-800 rounded-xl overflow-hidden z-20 min-w-[200px] max-h-[300px] overflow-y-auto"
            >
              <button
                onClick={() => {
                  onModelChange(null)
                  setShowModelDropdown(false)
                }}
                className={cn(
                  "w-full px-4 py-2.5 text-sm text-left transition-colors",
                  !selectedModel
                    ? "bg-skinny-yellow/10 text-skinny-yellow"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                )}
              >
                All Models
              </button>
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange(model.id)
                    setShowModelDropdown(false)
                  }}
                  className={cn(
                    "w-full px-4 py-2.5 text-sm text-left transition-colors",
                    selectedModel === model.id
                      ? "bg-skinny-yellow/10 text-skinny-yellow"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  )}
                >
                  {model.name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sort */}
      <div className="flex rounded-xl border-2 border-zinc-800 overflow-hidden">
        <button
          onClick={() => onSortChange('recent')}
          className={cn(
            "px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
            sortBy === 'recent'
              ? "bg-skinny-yellow text-black"
              : "bg-zinc-900 text-zinc-500 hover:text-white"
          )}
        >
          Recent
        </button>
        <button
          onClick={() => onSortChange('popular')}
          className={cn(
            "px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
            sortBy === 'popular'
              ? "bg-skinny-yellow text-black"
              : "bg-zinc-900 text-zinc-500 hover:text-white"
          )}
        >
          Popular
        </button>
      </div>
    </div>
  )
}
