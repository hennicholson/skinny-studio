'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Share2, Eye, Sparkles, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LikeButton } from './like-button'

export interface GalleryItem {
  id: string
  generationId: string | null
  imageUrl: string
  prompt: string
  title: string
  description: string
  model: {
    slug: string
    name: string
    category: string
  }
  creator: {
    id: string
    username: string
  }
  stats: {
    likes: number
    views: number
    remixes: number
  }
  isFeatured: boolean
  isLiked: boolean
  tags: string[]
  createdAt: string
  span: string
}

interface GalleryCardProps {
  item: GalleryItem
  index: number
  onLike: (id: string) => void
  onClick: () => void
  isLiked: boolean
}

export function GalleryCard({
  item,
  index,
  onLike,
  onClick,
  isLiked,
}: GalleryCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Staggered entrance animation
  const cardVariants = {
    hidden: {
      y: 60,
      scale: 0.92,
      opacity: 0,
      rotateX: 15,
    },
    visible: {
      y: 0,
      scale: 1,
      opacity: 1,
      rotateX: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 350,
        damping: 28,
        delay: index * 0.04,
      }
    }
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.imageUrl) return

    try {
      const response = await fetch(item.imageUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.title || 'gallery-image'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.share({
        title: item.title,
        text: item.prompt,
        url: window.location.href,
      })
    } catch {
      // Fallback: copy link
      await navigator.clipboard.writeText(window.location.href)
    }
  }

  return (
    <motion.div
      layoutId={`gallery-card-${item.id}`}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'relative group rounded-2xl overflow-hidden cursor-pointer',
        'bg-zinc-900/80 border border-white/[0.06]',
        'transition-shadow duration-300',
        item.span,
        isHovered && 'shadow-2xl shadow-black/50'
      )}
      style={{ perspective: '1000px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{
        scale: 1.02,
        transition: { type: 'spring', stiffness: 400, damping: 25 }
      }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Image with lazy loading */}
      <div className="relative w-full h-full min-h-[200px]">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
        )}
        <img
          src={item.imageUrl}
          alt={item.prompt}
          className={cn(
            'w-full h-full object-cover transition-all duration-500',
            imageLoaded ? 'opacity-100' : 'opacity-0',
            isHovered && 'scale-105'
          )}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
        />
      </div>

      {/* Featured badge */}
      {item.isFeatured && (
        <div className="absolute top-3 left-3 z-10">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, delay: index * 0.04 + 0.2 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-skinny-yellow to-skinny-green text-black text-[10px] font-bold uppercase tracking-wider"
          >
            <Sparkles size={10} />
            Featured
          </motion.div>
        </div>
      )}

      {/* Model badge (always visible) */}
      <div className="absolute top-3 right-3 z-10">
        <span className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white uppercase tracking-wider">
          {item.model.name}
        </span>
      </div>

      {/* Hover overlay with info */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
          >
            {/* Top actions */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05, type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute top-3 right-3 flex items-center gap-2"
            >
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-all"
              >
                <Download size={16} />
              </button>
              <button
                onClick={handleShare}
                className="p-2 rounded-lg bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-all"
              >
                <Share2 size={16} />
              </button>
            </motion.div>

            {/* Bottom info panel */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute bottom-0 left-0 right-0 p-4"
            >
              {/* Creator */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center">
                  <span className="text-[11px] font-bold text-black">
                    {item.creator.username[0].toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-white font-medium">@{item.creator.username}</span>
              </div>

              {/* Prompt */}
              <p className="text-sm text-white/90 line-clamp-2 mb-3 leading-relaxed">
                {item.prompt}
              </p>

              {/* Stats row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <LikeButton
                    isLiked={isLiked}
                    count={item.stats.likes}
                    onToggle={() => onLike(item.id)}
                    size="sm"
                  />
                  <div className="flex items-center gap-1 text-zinc-400">
                    <Eye size={14} />
                    <span className="text-xs tabular-nums">{item.stats.views}</span>
                  </div>
                </div>

                {/* Tags */}
                {item.tags.length > 0 && (
                  <div className="flex items-center gap-1">
                    {item.tags.slice(0, 2).map(tag => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] text-white/70 uppercase"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always visible mini stats (bottom left, subtle) */}
      <AnimatePresence>
        {!isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-3 left-3 flex items-center gap-2 text-white/60"
          >
            <div className="flex items-center gap-1">
              <motion.div
                animate={isLiked ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                <Heart size={12} fill={isLiked ? '#ef4444' : 'none'} className={isLiked ? 'text-red-400' : ''} />
              </motion.div>
              <span className="text-[11px] tabular-nums">{item.stats.likes}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
