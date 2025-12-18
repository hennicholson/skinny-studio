'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Images, Users, Search, Heart, Download, MoreHorizontal, Sparkles, Trash2, MessageSquare, Copy, X, Loader2, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MasonryGrid, MasonryItem } from '@/components/ui/masonry-grid'
import { useGeneration, Generation } from '@/lib/context/generation-context'
import { useApp } from '@/lib/context/app-context'
import { createClient } from '@supabase/supabase-js'

// Supabase client for fetching gallery images
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bkbcoxyumovpqiqfcxoa.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYmNveHl1bW92cHFpcWZjeG9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MjEyMDIsImV4cCI6MjA3MjA5NzIwMn0.i4X_9vK91hyPGkXm2JscPf4xhDEFTLI5sqEnPQIb1kM'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Type for creator gallery images from Supabase storage
interface CreatorGalleryImage {
  id: string
  imageUrl: string
  prompt: string
  model: string
  createdAt: Date
  likes: number
  creator?: string
}

type Tab = 'library' | 'community'

// Helper to detect video files
const isVideoUrl = (url: string) => {
  return url?.toLowerCase().match(/\.(mp4|webm|mov|avi)($|\?)/) !== null
}

// Image Detail Modal Component
interface ImageDetailModalProps {
  generation: Generation
  onClose: () => void
  onDelete: () => void
}

function ImageDetailModal({ generation, onClose, onDelete }: ImageDetailModalProps) {
  const { showToast } = useApp()
  const [isDownloading, setIsDownloading] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const outputUrls = generation.output_urls || []
  const hasMultipleImages = outputUrls.length > 1
  const currentImageUrl = outputUrls[currentImageIndex] || ''

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generation.prompt)
      showToast('success', 'Prompt copied to clipboard')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [generation.prompt, showToast])

  const handleDownload = useCallback(async () => {
    if (!currentImageUrl) return
    setIsDownloading(true)
    try {
      const response = await fetch(currentImageUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const modelName = generation.studio_models?.name || generation.model_slug
      a.download = `skinny-studio-${modelName}-${currentImageIndex + 1}-${Date.now()}.${blob.type.split('/')[1] || 'png'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setIsDownloading(false)
    }
  }, [currentImageUrl, currentImageIndex, generation])

  const goToPrevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : outputUrls.length - 1))
  }, [outputUrls.length])

  const goToNextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev < outputUrls.length - 1 ? prev + 1 : 0))
  }, [outputUrls.length])

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
          {/* Image or Video */}
          <div className="flex-1 bg-black flex items-center justify-center p-4 min-h-[300px] relative">
            {isVideoUrl(currentImageUrl) ? (
              <video
                src={currentImageUrl}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
                controls
                autoPlay
                loop
                muted
              />
            ) : (
              <img
                src={currentImageUrl}
                alt={generation.prompt}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            )}

            {/* Navigation arrows for multi-image */}
            {hasMultipleImages && (
              <>
                <button
                  onClick={goToPrevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={goToNextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                >
                  <ChevronRight size={24} />
                </button>

                {/* Image counter */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
                  <span className="text-xs font-medium text-white">
                    {currentImageIndex + 1} / {outputUrls.length}
                  </span>
                </div>
              </>
            )}
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
  imageUrl: string
  imageIndex: number
  totalImages: number
  onClick: () => void
  onDelete: () => void
}

function LibraryCard({ generation, imageUrl, imageIndex, totalImages, onClick, onDelete }: LibraryCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const modelName = generation.studio_models?.name || generation.model_slug
  const isVideo = isVideoUrl(imageUrl)

  return (
    <motion.div
      className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-skinny-yellow/30 transition-all duration-300 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
      onClick={onClick}
    >
      {/* Image or Video */}
      {isVideo ? (
        <div className="relative">
          <video
            src={imageUrl}
            className="w-full h-auto"
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }}
          />
          {/* Video play icon overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center group-hover:opacity-0 transition-opacity">
              <Play size={20} className="text-white ml-1" fill="white" />
            </div>
          </div>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={generation.prompt}
          className="w-full h-auto"
          loading="lazy"
        />
      )}

      {/* Multi-image badge */}
      {totalImages > 1 && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white">
            {imageIndex + 1}/{totalImages}
          </span>
        </div>
      )}

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
  const [creatorGalleryImages, setCreatorGalleryImages] = useState<CreatorGalleryImage[]>([])
  const [isLoadingGallery, setIsLoadingGallery] = useState(false)
  const { generations: userGenerations, deleteGeneration } = useGeneration()
  const { showToast } = useApp()

  // Fetch creator gallery images from Supabase storage
  useEffect(() => {
    async function fetchCreatorGalleryImages() {
      setIsLoadingGallery(true)
      try {
        const { data, error } = await supabase.storage
          .from('gallery')
          .list('creator-gallery', {
            limit: 100,
            sortBy: { column: 'created_at', order: 'desc' }
          })

        if (error) {
          console.error('Error fetching gallery images:', error)
          return
        }

        if (data) {
          // Convert storage objects to gallery image format
          const images: CreatorGalleryImage[] = data
            .filter(file => file.name.match(/\.(jpeg|jpg|png|webp)$/i))
            .map((file, index) => {
              // Extract prompt from filename (files are named like: A_3d_digital_202512091634.jpeg)
              const nameWithoutExt = file.name.replace(/\.(jpeg|jpg|png|webp)$/i, '')
              const promptFromName = nameWithoutExt
                .replace(/_/g, ' ')
                .replace(/\d{12}$/, '') // Remove timestamp suffix
                .trim()

              return {
                id: `gallery_${index}_${file.id || file.name}`,
                imageUrl: `${SUPABASE_URL}/storage/v1/object/public/gallery/creator-gallery/${file.name}`,
                prompt: promptFromName || 'Creative generation',
                model: 'Skinny Studio',
                createdAt: new Date(file.created_at || Date.now()),
                likes: Math.floor(Math.random() * 300) + 50, // Random likes for demo
                creator: 'skinny_creator'
              }
            })

          setCreatorGalleryImages(images)
        }
      } catch (err) {
        console.error('Failed to fetch gallery images:', err)
      } finally {
        setIsLoadingGallery(false)
      }
    }

    fetchCreatorGalleryImages()
  }, [])

  // Filter user generations by search
  const filteredUserGenerations = useMemo(() => {
    if (!searchQuery) return userGenerations
    const query = searchQuery.toLowerCase()
    return userGenerations.filter(g =>
      g.prompt?.toLowerCase().includes(query) ||
      (g.studio_models?.name || g.model_slug || '').toLowerCase().includes(query)
    )
  }, [userGenerations, searchQuery])

  // Flatten generations to show each image separately (for multi-image generations)
  const flattenedImages = useMemo(() => {
    return filteredUserGenerations.flatMap(gen =>
      (gen.output_urls || []).map((url, idx) => ({
        generation: gen,
        url,
        index: idx,
        totalImages: gen.output_urls?.length || 1
      }))
    )
  }, [filteredUserGenerations])

  // Filter community generations by search
  const filteredCommunityGenerations = useMemo(() => {
    if (!searchQuery) return creatorGalleryImages
    const query = searchQuery.toLowerCase()
    return creatorGalleryImages.filter(g =>
      g.prompt.toLowerCase().includes(query) ||
      g.model.toLowerCase().includes(query)
    )
  }, [searchQuery, creatorGalleryImages])

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
          flattenedImages.length > 0 ? (
            <MasonryGrid>
              {flattenedImages.map((item) => (
                <MasonryItem key={`${item.generation.id}-${item.index}`}>
                  <LibraryCard
                    generation={item.generation}
                    imageUrl={item.url}
                    imageIndex={item.index}
                    totalImages={item.totalImages}
                    onClick={() => setSelectedGeneration(item.generation)}
                    onDelete={() => handleDeleteGeneration(item.generation.id)}
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
          isLoadingGallery ? (
            /* Loading State */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <Loader2 size={40} className="text-skinny-yellow animate-spin mb-4" />
              <p className="text-zinc-500">Loading creator gallery...</p>
            </motion.div>
          ) : filteredCommunityGenerations.length > 0 ? (
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
              <h3 className="text-xl font-bold text-white mb-2">
                {searchQuery ? 'No results found' : 'Gallery is empty'}
              </h3>
              <p className="text-zinc-500 max-w-md">
                {searchQuery
                  ? "Try adjusting your search to find what you're looking for."
                  : "Check back soon for featured creator content!"}
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
