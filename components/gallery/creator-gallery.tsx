'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Search, Grid3X3, Compass, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'
import { GalleryCard, GalleryItem } from './gallery-card'
import { GalleryModal } from './gallery-modal'
import { InfiniteExplore } from './infinite-explore'

type SortOption = 'recent' | 'popular' | 'views'
type ViewMode = 'grid' | 'explore'

export function CreatorGallery() {
  const [searchQuery, setSearchQuery] = useState('')
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // User likes state
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set())

  // Modal state
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Build auth headers helper
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (typeof window !== 'undefined') {
      const devToken = localStorage.getItem('whop-dev-token')
      const devUserId = localStorage.getItem('whop-dev-user-id')
      if (devToken) headers['x-whop-user-token'] = devToken
      if (devUserId) headers['x-whop-user-id'] = devUserId
    }
    return headers
  }, [])

  // Fetch gallery items from API
  const fetchGallery = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: '0',
        sort: sortBy,
        ...(showFeaturedOnly && { featured: 'true' }),
      })

      const response = await fetch(`/api/gallery?${params}`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) throw new Error('Failed to fetch gallery')

      const data = await response.json()
      setGalleryItems(data.items || [])
      setUserLikes(new Set(data.userLikes || []))
    } catch (err) {
      console.error('Failed to fetch gallery:', err)
    } finally {
      setIsLoading(false)
    }
  }, [sortBy, showFeaturedOnly, getAuthHeaders])

  useEffect(() => {
    fetchGallery()
  }, [fetchGallery])

  // Handle like toggle with optimistic update
  const handleLike = useCallback(async (id: string) => {
    const isCurrentlyLiked = userLikes.has(id)

    // Optimistic update
    setUserLikes(prev => {
      const next = new Set(prev)
      if (isCurrentlyLiked) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

    // Update local item stats optimistically
    setGalleryItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          stats: {
            ...item.stats,
            likes: item.stats.likes + (isCurrentlyLiked ? -1 : 1)
          }
        }
      }
      return item
    }))

    // API call
    try {
      const response = await fetch(`/api/gallery/${id}/like`, {
        method: isCurrentlyLiked ? 'DELETE' : 'POST',
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        // Revert on failure
        setUserLikes(prev => {
          const next = new Set(prev)
          if (isCurrentlyLiked) {
            next.add(id)
          } else {
            next.delete(id)
          }
          return next
        })

        setGalleryItems(prev => prev.map(item => {
          if (item.id === id) {
            return {
              ...item,
              stats: {
                ...item.stats,
                likes: item.stats.likes + (isCurrentlyLiked ? 1 : -1)
              }
            }
          }
          return item
        }))
      }
    } catch (err) {
      console.error('Failed to toggle like:', err)
    }
  }, [userLikes, getAuthHeaders])

  // Filter by search
  const filteredItems = searchQuery
    ? galleryItems.filter(item =>
        item.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.creator.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : galleryItems

  // Open modal
  const openModal = (index: number) => {
    setSelectedIndex(index)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedIndex(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06] bg-zinc-950/50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center">
              <Users size={20} className="text-black" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Creator Gallery</h2>
              <p className="text-xs text-zinc-500">
                {filteredItems.length} creations • {userLikes.size} liked
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-44 pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-skinny-yellow/50 transition-colors"
              />
            </div>

            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-skinny-yellow/50 transition-colors cursor-pointer"
            >
              <option value="recent">Recent</option>
              <option value="popular">Popular</option>
              <option value="views">Most Viewed</option>
            </select>

            {/* Featured filter */}
            <button
              onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
              className={cn(
                'px-3 py-2 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5',
                showFeaturedOnly
                  ? 'bg-skinny-yellow text-black border-skinny-yellow'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
              )}
            >
              <Sparkles size={14} />
              Featured
            </button>

            {/* View mode toggle */}
            <div className="flex items-center rounded-xl overflow-hidden border border-zinc-800">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'px-3 py-2 transition-colors',
                  viewMode === 'grid'
                    ? 'bg-skinny-yellow text-black'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                )}
              >
                <Grid3X3 size={16} />
              </button>
              <button
                onClick={() => setViewMode('explore')}
                className={cn(
                  'px-3 py-2 transition-colors',
                  viewMode === 'explore'
                    ? 'bg-skinny-yellow text-black'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                )}
              >
                <Compass size={16} />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchGallery()}
              disabled={isLoading}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={cn(isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="text-skinny-yellow animate-spin" />
              <p className="text-sm text-zinc-500">Loading gallery...</p>
            </div>
          </motion.div>
        ) : filteredItems.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center py-20 text-center"
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
        ) : viewMode === 'explore' ? (
          <motion.div
            key="explore"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1"
          >
            <InfiniteExplore
              items={filteredItems}
              onItemClick={openModal}
              onLike={handleLike}
              userLikes={userLikes}
            />
          </motion.div>
        ) : (
          <PullToRefresh
            className="flex-1 p-4 sm:p-6"
            onRefresh={async () => {
              await fetchGallery()
            }}
          >
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 auto-rows-[200px]"
            >
              {filteredItems.map((item, index) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  index={index}
                  onLike={handleLike}
                  onClick={() => openModal(index)}
                  isLiked={userLikes.has(item.id)}
                />
              ))}
            </motion.div>
          </PullToRefresh>
        )}
      </AnimatePresence>

      {/* Modal */}
      <GalleryModal
        items={filteredItems}
        activeIndex={selectedIndex ?? 0}
        isOpen={isModalOpen}
        onClose={closeModal}
        onNavigate={setSelectedIndex}
        onLike={handleLike}
        userLikes={userLikes}
      />
    </div>
  )
}
