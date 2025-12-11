'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Images, Users, Search, Heart, Download, MoreHorizontal, Sparkles, Trash2, MessageSquare, Copy, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MasonryGrid, MasonryItem } from '@/components/ui/masonry-grid'
import { useGeneration, Generation } from '@/lib/context/generation-context'
import { useApp } from '@/lib/context/app-context'

// Mock data for community/creator gallery
const mockCommunityGenerations = [
  {
    id: 'c1',
    imageUrl: 'https://picsum.photos/seed/comm1/600/800',
    prompt: 'Futuristic cityscape at night with neon lights',
    model: 'FLUX Pro',
    createdAt: new Date('2024-01-15'),
    likes: 156,
    creator: 'alex_creates',
  },
  {
    id: 'c2',
    imageUrl: 'https://picsum.photos/seed/comm2/800/600',
    prompt: 'Fantasy character portrait with magical elements',
    model: 'SDXL',
    createdAt: new Date('2024-01-14'),
    likes: 243,
    creator: 'art_master',
  },
  {
    id: 'c3',
    imageUrl: 'https://picsum.photos/seed/comm3/600/900',
    prompt: 'Hyper-realistic product render',
    model: 'FLUX Pro',
    createdAt: new Date('2024-01-13'),
    likes: 89,
    creator: 'design_studio',
  },
  {
    id: 'c4',
    imageUrl: 'https://picsum.photos/seed/comm4/700/500',
    prompt: 'Anime style illustration of a warrior',
    model: 'SDXL',
    createdAt: new Date('2024-01-12'),
    likes: 312,
    creator: 'anime_pro',
  },
  {
    id: 'c5',
    imageUrl: 'https://picsum.photos/seed/comm5/500/700',
    prompt: 'Ethereal nature scene with mystical fog',
    model: 'FLUX Pro',
    createdAt: new Date('2024-01-11'),
    likes: 178,
    creator: 'nature_vibes',
  },
  {
    id: 'c6',
    imageUrl: 'https://picsum.photos/seed/comm6/800/800',
    prompt: 'Abstract fluid art in vibrant colors',
    model: 'FLUX Pro',
    createdAt: new Date('2024-01-10'),
    likes: 267,
    creator: 'color_master',
  },
]

type Tab = 'library' | 'community'

// Image Detail Modal Component
interface ImageDetailModalProps {
  generation: Generation
  onClose: () => void
  onDelete: () => void
}

function ImageDetailModal({ generation, onClose, onDelete }: ImageDetailModalProps) {
  const { showToast } = useApp()
  const [isDownloading, setIsDownloading] = useState(false)

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generation.prompt)
      showToast('success', 'Prompt copied to clipboard')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [generation.prompt, showToast])

  const handleDownload = useCallback(async () => {
    const imageUrl = generation.output_urls?.[0]
    if (!imageUrl) return
    setIsDownloading(true)
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const modelName = generation.studio_models?.name || generation.model_slug
      a.download = `skinny-studio-${modelName}-${Date.now()}.${blob.type.split('/')[1] || 'png'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setIsDownloading(false)
    }
  }, [generation])

  const handleDelete = useCallback(() => {
    onDelete()
    onClose()
    showToast('success', 'Removed from Library')
  }, [onDelete, onClose, showToast])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative max-w-4xl w-full max-h-[90vh] bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/60 text-white/60 hover:text-white hover:bg-black/80 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col md:flex-row max-h-[90vh]">
          {/* Image */}
          <div className="flex-1 bg-black flex items-center justify-center p-4 min-h-[300px]">
            <img
              src={generation.output_urls?.[0] || ''}
              alt={generation.prompt}
              className="max-w-full max-h-[60vh] object-contain rounded-lg"
            />
          </div>

          {/* Details sidebar */}
          <div className="w-full md:w-80 p-6 border-t md:border-t-0 md:border-l border-zinc-800 overflow-y-auto">
            {/* Model badge */}
            <div className="mb-4">
              <span className="px-3 py-1.5 rounded-full bg-skinny-yellow/20 text-skinny-yellow text-xs font-bold uppercase tracking-wider">
                {generation.studio_models?.name || generation.model_slug}
              </span>
            </div>

            {/* Prompt */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Prompt</h4>
              <p className="text-sm text-white/80 leading-relaxed">{generation.prompt}</p>
            </div>

            {/* Date */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Created</h4>
              <p className="text-sm text-white/60">
                {new Date(generation.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleCopyPrompt}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
              >
                <Copy size={16} />
                <span className="text-sm font-medium">Copy Prompt</span>
              </button>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-skinny-yellow text-black hover:bg-skinny-green transition-colors disabled:opacity-50"
              >
                <Download size={16} />
                <span className="text-sm font-bold">{isDownloading ? 'Downloading...' : 'Download'}</span>
              </button>
              <button
                onClick={handleDelete}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={16} />
                <span className="text-sm font-medium">Remove from Library</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Library Card for user's generations
interface LibraryCardProps {
  generation: Generation
  onClick: () => void
  onDelete: () => void
}

function LibraryCard({ generation, onClick, onDelete }: LibraryCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const modelName = generation.studio_models?.name || generation.model_slug

  return (
    <motion.div
      className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-skinny-yellow/30 transition-all duration-300 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
      onClick={onClick}
    >
      {/* Image */}
      <img
        src={generation.output_urls?.[0] || ''}
        alt={generation.prompt}
        className="w-full h-auto"
        loading="lazy"
      />

      {/* Overlay on hover */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
          >
            {/* Top actions */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="p-2 rounded-lg bg-black/40 text-white hover:bg-red-500/20 hover:text-red-400 backdrop-blur-sm transition-all"
                title="Remove from Library"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Bottom info */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="text-sm text-white line-clamp-2 mb-2">{generation.prompt}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  {modelName}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {new Date(generation.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model badge (always visible) */}
      <div className="absolute top-3 left-3">
        <span className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white uppercase tracking-wider">
          {modelName}
        </span>
      </div>
    </motion.div>
  )
}

// Community Gallery Card (for mock data)
interface GalleryCardProps {
  generation: {
    id: string
    imageUrl: string
    prompt: string
    model: string
    createdAt: Date
    likes: number
    creator?: string
  }
  showCreator?: boolean
}

function GalleryCard({ generation, showCreator }: GalleryCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isLiked, setIsLiked] = useState(false)

  return (
    <motion.div
      className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all duration-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
    >
      {/* Image */}
      <img
        src={generation.imageUrl}
        alt={generation.prompt}
        className="w-full h-auto"
        loading="lazy"
      />

      {/* Overlay on hover */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
          >
            {/* Top actions */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                onClick={() => setIsLiked(!isLiked)}
                className={cn(
                  "p-2 rounded-lg backdrop-blur-sm transition-all",
                  isLiked
                    ? "bg-red-500/20 text-red-400"
                    : "bg-black/40 text-white hover:bg-black/60"
                )}
              >
                <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button className="p-2 rounded-lg bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-all">
                <Download size={16} />
              </button>
              <button className="p-2 rounded-lg bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-all">
                <MoreHorizontal size={16} />
              </button>
            </div>

            {/* Bottom info */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              {showCreator && generation.creator && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">
                      {generation.creator[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-300">@{generation.creator}</span>
                </div>
              )}
              <p className="text-sm text-white line-clamp-2 mb-2">{generation.prompt}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  {generation.model}
                </span>
                <div className="flex items-center gap-1 text-zinc-400">
                  <Heart size={12} />
                  <span className="text-xs">{generation.likes}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model badge (always visible) */}
      <div className="absolute top-3 left-3">
        <span className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white uppercase tracking-wider">
          {generation.model}
        </span>
      </div>
    </motion.div>
  )
}

export function GalleryView() {
  const [activeTab, setActiveTab] = useState<Tab>('library')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null)
  const { generations: userGenerations, deleteGeneration } = useGeneration()
  const { showToast } = useApp()

  // Filter user generations by search
  const filteredUserGenerations = useMemo(() => {
    if (!searchQuery) return userGenerations
    const query = searchQuery.toLowerCase()
    return userGenerations.filter(g =>
      g.prompt?.toLowerCase().includes(query) ||
      (g.studio_models?.name || g.model_slug || '').toLowerCase().includes(query)
    )
  }, [userGenerations, searchQuery])

  // Filter community generations by search
  const filteredCommunityGenerations = useMemo(() => {
    if (!searchQuery) return mockCommunityGenerations
    const query = searchQuery.toLowerCase()
    return mockCommunityGenerations.filter(g =>
      g.prompt.toLowerCase().includes(query) ||
      g.model.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const handleDeleteGeneration = useCallback((id: string) => {
    deleteGeneration(id)
    showToast('success', 'Removed from Library')
  }, [deleteGeneration, showToast])

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header with tabs */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-sm border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Gallery</h2>

            {/* Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 sm:w-64 pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-skinny-yellow/50 transition-colors"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('library')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all",
                activeTab === 'library'
                  ? "bg-skinny-yellow text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700"
              )}
            >
              <Images size={16} />
              My Library
            </button>
            <button
              onClick={() => setActiveTab('community')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all",
                activeTab === 'community'
                  ? "bg-skinny-yellow text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700"
              )}
            >
              <Users size={16} />
              Creator Gallery
            </button>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'library' ? (
          // User's Library
          filteredUserGenerations.length > 0 ? (
            <MasonryGrid>
              {filteredUserGenerations.map((generation) => (
                <MasonryItem key={generation.id}>
                  <LibraryCard
                    generation={generation}
                    onClick={() => setSelectedGeneration(generation)}
                    onDelete={() => handleDeleteGeneration(generation.id)}
                  />
                </MasonryItem>
              ))}
            </MasonryGrid>
          ) : (
            /* Empty State for Library */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mb-6">
                <Sparkles size={32} className="text-zinc-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {searchQuery ? 'No results found' : 'Your library is empty'}
              </h3>
              <p className="text-zinc-500 max-w-md mb-6">
                {searchQuery
                  ? "Try adjusting your search to find what you're looking for."
                  : "Images you save from chat will appear here. Start creating to build your library!"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => {
                    // Would need to pass setMode from parent or use router
                    // For now just show a message
                  }}
                  className="px-6 py-2.5 rounded-xl bg-skinny-yellow text-black font-bold text-sm hover:bg-skinny-green transition-colors flex items-center gap-2"
                >
                  <MessageSquare size={16} />
                  Start Creating
                </button>
              )}
            </motion.div>
          )
        ) : (
          // Community Gallery
          filteredCommunityGenerations.length > 0 ? (
            <MasonryGrid>
              {filteredCommunityGenerations.map((generation) => (
                <MasonryItem key={generation.id}>
                  <GalleryCard
                    generation={generation}
                    showCreator={true}
                  />
                </MasonryItem>
              ))}
            </MasonryGrid>
          ) : (
            /* Empty State for Community */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mb-6">
                <Users size={32} className="text-zinc-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No results found</h3>
              <p className="text-zinc-500 max-w-md">
                Try adjusting your search to find what you're looking for.
              </p>
            </motion.div>
          )
        )}
      </div>

      {/* Image Detail Modal */}
      <AnimatePresence>
        {selectedGeneration && (
          <ImageDetailModal
            generation={selectedGeneration}
            onClose={() => setSelectedGeneration(null)}
            onDelete={() => handleDeleteGeneration(selectedGeneration.id)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
