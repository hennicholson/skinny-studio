'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Images,
  Search,
  Grid,
  List,
  Loader2,
  Download,
  ExternalLink,
  X,
  ImageIcon,
  Video,
  Music,
  Sparkles,
  RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Generation {
  id: string
  prompt: string
  output_urls: string[]
  created_at: string
  model_slug: string
  model_category: string
  studio_models?: {
    name: string
    category: string
  }
}

const CATEGORIES = [
  { id: null, label: 'All', icon: Sparkles },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'audio', label: 'Audio', icon: Music },
]

export function LibraryView() {
  const [generations, setGenerations] = useState<Generation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selectedGeneration, setSelectedGeneration] = useState<{ gen: Generation; imageIdx: number } | null>(null)

  const fetchGenerations = useCallback(async () => {
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

      const params = new URLSearchParams({ limit: '100' })
      if (categoryFilter) {
        params.set('category', categoryFilter)
      }

      const res = await fetch(`/api/generations?${params}`, { headers })

      if (res.ok) {
        const data = await res.json()
        setGenerations(data.generations || [])
      } else if (res.status === 401) {
        setError('Sign in to view your library')
        setGenerations([])
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.error || 'Failed to fetch generations')
      }
    } catch (err) {
      console.error('Failed to fetch generations:', err)
      setError('Failed to load library')
    } finally {
      setIsLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    fetchGenerations()
  }, [fetchGenerations])

  const filteredGenerations = searchQuery
    ? generations.filter(g =>
        g.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.model_slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.studio_models?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : generations

  // Flatten generations to individual images for grid display
  const allImages = filteredGenerations.flatMap(gen =>
    (gen.output_urls || []).map((url, idx) => ({
      gen,
      url,
      idx
    }))
  )

  const handleDownload = async (url: string, prompt: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `skinny-${prompt?.slice(0, 20) || 'image'}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h2 className="text-xl font-bold text-white uppercase tracking-tight">Library</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchGenerations}
              className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === 'grid'
                  ? "text-skinny-yellow bg-skinny-yellow/10"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-800"
              )}
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === 'list'
                  ? "text-skinny-yellow bg-skinny-yellow/10"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-800"
              )}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-zinc-800/50">
        <div className="max-w-6xl mx-auto space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your generations..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-skinny-yellow/50 transition-colors"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon
              return (
                <button
                  key={cat.id || 'all'}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                    categoryFilter === cat.id
                      ? "bg-skinny-yellow text-black"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  )}
                >
                  <Icon size={14} />
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={32} className="text-skinny-yellow animate-spin mb-4" />
              <p className="text-zinc-500 text-sm">Loading your library...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                <Images size={28} className="text-zinc-600" />
              </div>
              <p className="text-zinc-400 mb-4">{error}</p>
              <button
                onClick={fetchGenerations}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm transition-colors"
              >
                Try again
              </button>
            </div>
          ) : allImages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mb-6">
                <Images size={32} className="text-zinc-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {searchQuery ? 'No matching generations' : 'Your Library is Empty'}
              </h3>
              <p className="text-zinc-500 mb-6 max-w-md">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Start a conversation to generate images. All your creations will appear here.'}
              </p>
            </motion.div>
          ) : viewMode === 'grid' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
            >
              {allImages.map(({ gen, url, idx }) => (
                <motion.button
                  key={`${gen.id}-${idx}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setSelectedGeneration({ gen, imageIdx: idx })}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-skinny-yellow/50 transition-all"
                >
                  <img
                    src={url}
                    alt={gen.prompt || 'Generated image'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white/80 line-clamp-2">
                      {gen.prompt?.slice(0, 60) || 'Untitled'}
                    </p>
                    <p className="text-[9px] text-zinc-400 mt-0.5">
                      {gen.studio_models?.name || gen.model_slug}
                    </p>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {filteredGenerations.map((gen) => (
                <motion.div
                  key={gen.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  {/* Thumbnails */}
                  <div className="flex gap-2 flex-shrink-0">
                    {gen.output_urls?.slice(0, 2).map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedGeneration({ gen, imageIdx: idx })}
                        className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-skinny-yellow/50 transition-all"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {(gen.output_urls?.length || 0) > 2 && (
                      <div className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm">
                        +{gen.output_urls.length - 2}
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm line-clamp-2 mb-1">
                      {gen.prompt || 'Untitled generation'}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{gen.studio_models?.name || gen.model_slug}</span>
                      <span>•</span>
                      <span>{formatDate(gen.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-start gap-1">
                    <button
                      onClick={() => handleDownload(gen.output_urls[0], gen.prompt)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedGeneration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
            onClick={() => setSelectedGeneration(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden"
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedGeneration(null)}
                className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/50 text-white hover:bg-black/80 transition-colors"
              >
                <X size={20} />
              </button>

              {/* Image */}
              <div className="relative aspect-square max-h-[70vh] bg-zinc-900">
                <img
                  src={selectedGeneration.gen.output_urls[selectedGeneration.imageIdx]}
                  alt={selectedGeneration.gen.prompt || 'Generated image'}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Details */}
              <div className="p-6 border-t border-zinc-800">
                <p className="text-white mb-2">{selectedGeneration.gen.prompt || 'Untitled'}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <span>{selectedGeneration.gen.studio_models?.name || selectedGeneration.gen.model_slug}</span>
                    <span>•</span>
                    <span>{formatDate(selectedGeneration.gen.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(
                        selectedGeneration.gen.output_urls[selectedGeneration.imageIdx],
                        selectedGeneration.gen.prompt
                      )}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-skinny-yellow text-black font-medium hover:bg-skinny-green transition-colors"
                    >
                      <Download size={16} />
                      Download
                    </button>
                    <a
                      href={selectedGeneration.gen.output_urls[selectedGeneration.imageIdx]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink size={18} />
                    </a>
                  </div>
                </div>

                {/* Multiple images navigation */}
                {selectedGeneration.gen.output_urls.length > 1 && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-800">
                    {selectedGeneration.gen.output_urls.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedGeneration({ ...selectedGeneration, imageIdx: idx })}
                        className={cn(
                          "w-12 h-12 rounded-lg overflow-hidden border-2 transition-all",
                          idx === selectedGeneration.imageIdx
                            ? "border-skinny-yellow"
                            : "border-transparent hover:border-zinc-600"
                        )}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
