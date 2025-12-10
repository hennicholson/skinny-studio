'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Images, Users, Search, SlidersHorizontal, Grid3X3, LayoutGrid, Heart, Download, Share2, MoreHorizontal, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MasonryGrid, MasonryItem } from '@/components/ui/masonry-grid'

// Mock data for user's generations
const mockUserGenerations = [
  {
    id: '1',
    imageUrl: 'https://picsum.photos/seed/gen1/600/800',
    prompt: 'Professional product photography of a sleek minimalist chair',
    model: 'FLUX Pro',
    createdAt: new Date('2024-01-15'),
    likes: 24,
  },
  {
    id: '2',
    imageUrl: 'https://picsum.photos/seed/gen2/800/600',
    prompt: 'Cinematic portrait with dramatic lighting',
    model: 'FLUX Pro',
    createdAt: new Date('2024-01-14'),
    likes: 18,
  },
  {
    id: '3',
    imageUrl: 'https://picsum.photos/seed/gen3/600/900',
    prompt: 'Abstract geometric art with bold colors',
    model: 'SDXL',
    createdAt: new Date('2024-01-13'),
    likes: 42,
  },
  {
    id: '4',
    imageUrl: 'https://picsum.photos/seed/gen4/700/700',
    prompt: 'Breathtaking mountain landscape at golden hour',
    model: 'FLUX Pro',
    createdAt: new Date('2024-01-12'),
    likes: 35,
  },
]

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

  // Get generations based on active tab
  const generations = activeTab === 'library' ? mockUserGenerations : mockCommunityGenerations

  // Filter by search
  const filteredGenerations = useMemo(() => {
    if (!searchQuery) return generations
    const query = searchQuery.toLowerCase()
    return generations.filter(g =>
      g.prompt.toLowerCase().includes(query) ||
      g.model.toLowerCase().includes(query)
    )
  }, [generations, searchQuery])

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
        {filteredGenerations.length > 0 ? (
          <MasonryGrid>
            {filteredGenerations.map((generation) => (
              <MasonryItem key={generation.id}>
                <GalleryCard
                  generation={generation}
                  showCreator={activeTab === 'community'}
                />
              </MasonryItem>
            ))}
          </MasonryGrid>
        ) : (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mb-6">
              {activeTab === 'library' ? (
                <Sparkles size={32} className="text-zinc-600" />
              ) : (
                <Users size={32} className="text-zinc-600" />
              )}
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {activeTab === 'library' ? 'No generations yet' : 'No results found'}
            </h3>
            <p className="text-zinc-500 max-w-md">
              {activeTab === 'library'
                ? "Start creating images to build your library!"
                : "Try adjusting your search to find what you're looking for."}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
