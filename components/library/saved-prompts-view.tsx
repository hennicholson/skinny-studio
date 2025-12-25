'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Search,
  Copy,
  Check,
  Trash2,
  Star,
  MoreVertical,
  ExternalLink,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSavedPrompts, SavedPrompt } from '@/lib/context/saved-prompts-context'
import { toast } from 'sonner'

interface SavedPromptsViewProps {
  searchQuery: string
}

export function SavedPromptsView({ searchQuery }: SavedPromptsViewProps) {
  const { prompts, isLoading, deletePrompt, toggleFavorite, copyPromptToClipboard } = useSavedPrompts()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filter prompts by search
  const filteredPrompts = searchQuery
    ? prompts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : prompts

  const handleCopy = useCallback(async (prompt: SavedPrompt) => {
    await copyPromptToClipboard(prompt)
    setCopiedId(prompt.id)
    toast.success('Prompt copied to clipboard!')
    setTimeout(() => setCopiedId(null), 2000)
  }, [copyPromptToClipboard])

  const handleDelete = useCallback(async (prompt: SavedPrompt) => {
    if (confirm('Delete this saved prompt?')) {
      const success = await deletePrompt(prompt.id)
      if (success) {
        toast.success('Prompt deleted')
      } else {
        toast.error('Failed to delete prompt')
      }
    }
  }, [deletePrompt])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-skinny-yellow border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-500 text-sm">Loading saved prompts...</p>
      </div>
    )
  }

  if (filteredPrompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-zinc-900 shadow-lg flex items-center justify-center mb-6">
          <FileText size={32} className="text-zinc-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          {searchQuery ? 'No matching prompts' : 'No saved prompts yet'}
        </h3>
        <p className="text-zinc-500 max-w-md">
          {searchQuery
            ? 'Try a different search term'
            : 'Use Creative Consultant to build prompts, then save them here for use in your favorite AI tools like Midjourney, DALL-E, or Stable Diffusion.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header info */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-500">
          {filteredPrompts.length} saved prompt{filteredPrompts.length !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-zinc-600">
          Click to copy for external AI tools
        </p>
      </div>

      {/* Prompts list */}
      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {filteredPrompts.map((prompt) => {
            const isCopied = copiedId === prompt.id
            const isExpanded = expandedId === prompt.id

            return (
              <motion.div
                key={prompt.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "group relative rounded-xl border transition-all duration-200",
                  "bg-white/[0.02] border-white/[0.06]",
                  "hover:bg-white/[0.04] hover:border-white/[0.1]"
                )}
              >
                {/* Main content - clickable to copy */}
                <button
                  onClick={() => handleCopy(prompt)}
                  className="w-full text-left p-4"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate pr-4">
                        {prompt.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <Clock size={10} />
                          {formatDate(prompt.created_at)}
                        </span>
                        {prompt.use_count > 0 && (
                          <span className="text-[10px] text-zinc-600">
                            Used {prompt.use_count}x
                          </span>
                        )}
                        {prompt.category && prompt.category !== 'general' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-400">
                            {prompt.category}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Copy indicator */}
                    <div className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                      isCopied
                        ? "bg-skinny-yellow/20 text-skinny-yellow"
                        : "bg-white/[0.05] text-zinc-400 group-hover:text-skinny-yellow group-hover:bg-skinny-yellow/10"
                    )}>
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                    </div>
                  </div>

                  {/* Prompt preview */}
                  <p className={cn(
                    "text-sm text-zinc-400 leading-relaxed",
                    isExpanded ? "" : "line-clamp-3"
                  )}>
                    {prompt.prompt}
                  </p>

                  {/* Tags */}
                  {prompt.tags && prompt.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {prompt.tags.slice(0, 5).map((tag, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-zinc-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>

                {/* Action buttons - visible on hover */}
                <div className="absolute top-3 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Expand/Collapse */}
                  {prompt.prompt.length > 150 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedId(isExpanded ? null : prompt.id)
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-colors"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      <ExternalLink size={12} />
                    </button>
                  )}

                  {/* Favorite */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(prompt.id)
                    }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      prompt.is_favorite
                        ? "text-skinny-yellow"
                        : "text-zinc-500 hover:text-skinny-yellow hover:bg-white/[0.05]"
                    )}
                    title={prompt.is_favorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star size={12} fill={prompt.is_favorite ? "currentColor" : "none"} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(prompt)
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete prompt"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
