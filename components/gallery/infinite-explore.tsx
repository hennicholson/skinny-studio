'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, useMotionValue, useSpring, animate, PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import { GalleryItem } from './gallery-card'
import { LikeButton } from './like-button'
import { Heart, Eye } from 'lucide-react'

interface InfiniteExploreProps {
  items: GalleryItem[]
  onItemClick: (index: number) => void
  onLike: (id: string) => void
  userLikes: Set<string>
}

// Card dimensions and spacing
const CARD_WIDTH = 280
const CARD_GAP = 24
const ROW_HEIGHT = 380
const COLUMNS = 5

export function InfiniteExplore({
  items,
  onItemClick,
  onLike,
  userLikes,
}: InfiniteExploreProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Motion values for pan position
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Smooth springs for the motion
  const springX = useSpring(x, { stiffness: 100, damping: 30 })
  const springY = useSpring(y, { stiffness: 100, damping: 30 })

  // Calculate grid dimensions
  const totalWidth = COLUMNS * (CARD_WIDTH + CARD_GAP)
  const rows = Math.ceil(items.length / COLUMNS)
  const totalHeight = rows * (ROW_HEIGHT + CARD_GAP)

  // Get container size on mount/resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Center the grid initially
  useEffect(() => {
    if (containerSize.width && containerSize.height) {
      const centerX = (containerSize.width - totalWidth) / 2
      const centerY = (containerSize.height - totalHeight) / 2
      x.set(centerX)
      y.set(centerY)
    }
  }, [containerSize, totalWidth, totalHeight])

  // Handle drag
  const handleDrag = useCallback((event: any, info: PanInfo) => {
    x.set(x.get() + info.delta.x)
    y.set(y.get() + info.delta.y)
  }, [x, y])

  // Handle wheel scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    x.set(x.get() - e.deltaX * 0.5)
    y.set(y.get() - e.deltaY * 0.5)
  }, [x, y])

  // Position cards in a masonry-like grid
  const getCardPosition = (index: number) => {
    const col = index % COLUMNS
    const row = Math.floor(index / COLUMNS)

    // Offset every other row for visual interest
    const rowOffset = row % 2 === 0 ? 0 : (CARD_WIDTH + CARD_GAP) / 2

    return {
      x: col * (CARD_WIDTH + CARD_GAP) + rowOffset,
      y: row * (ROW_HEIGHT + CARD_GAP),
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-zinc-950 cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
    >
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Draggable canvas */}
      <motion.div
        className="absolute"
        style={{
          x: springX,
          y: springY,
          width: totalWidth + containerSize.width,
          height: totalHeight + containerSize.height,
        }}
        drag
        dragMomentum={true}
        dragElastic={0.1}
        onDrag={handleDrag}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
      >
        {items.map((item, index) => {
          const pos = getCardPosition(index)
          return (
            <ExploreCard
              key={item.id}
              item={item}
              index={index}
              position={pos}
              onItemClick={() => !isDragging && onItemClick(index)}
              onLike={() => onLike(item.id)}
              isLiked={userLikes.has(item.id)}
              isDragging={isDragging}
            />
          )
        })}
      </motion.div>

      {/* Instructions overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-zinc-400 text-sm pointer-events-none">
        <span>Drag to explore</span>
        <span className="text-zinc-600">•</span>
        <span>Click to view</span>
        <span className="text-zinc-600">•</span>
        <span>Scroll to pan</span>
      </div>

      {/* Vignette overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  )
}

interface ExploreCardProps {
  item: GalleryItem
  index: number
  position: { x: number; y: number }
  onItemClick: () => void
  onLike: () => void
  isLiked: boolean
  isDragging: boolean
}

function ExploreCard({
  item,
  index,
  position,
  onItemClick,
  onLike,
  isLiked,
  isDragging,
}: ExploreCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Random rotation for polaroid effect (-8 to 8 degrees)
  const rotation = useRef((Math.random() - 0.5) * 16)

  // Staggered entrance animation
  const cardVariants = {
    hidden: {
      scale: 0.8,
      opacity: 0,
      rotate: rotation.current + (Math.random() - 0.5) * 20,
    },
    visible: {
      scale: 1,
      opacity: 1,
      rotate: rotation.current,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 25,
        delay: index * 0.03 + Math.random() * 0.1,
      }
    }
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'absolute w-[280px] rounded-xl overflow-hidden',
        'bg-zinc-900 border border-white/10',
        'shadow-xl shadow-black/30',
        'transition-shadow duration-300',
        isHovered && !isDragging && 'shadow-2xl shadow-skinny-yellow/20 z-10'
      )}
      style={{
        left: position.x,
        top: position.y,
        transformOrigin: 'center center',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onItemClick}
      whileHover={isDragging ? {} : { scale: 1.05, rotate: 0, zIndex: 10 }}
      whileTap={isDragging ? {} : { scale: 0.98 }}
    >
      {/* Image */}
      <div className="relative aspect-[4/5] overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
        )}
        <img
          src={item.imageUrl}
          alt={item.prompt}
          className={cn(
            'w-full h-full object-cover transition-all duration-300',
            imageLoaded ? 'opacity-100' : 'opacity-0',
            isHovered && !isDragging && 'scale-105'
          )}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {/* Hover overlay */}
        {isHovered && !isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
          >
            {/* Quick actions */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <LikeButton
                isLiked={isLiked}
                count={item.stats.likes}
                onToggle={(e) => {
                  e?.stopPropagation?.()
                  onLike()
                }}
                size="sm"
              />
              <div className="flex items-center gap-1 text-zinc-400">
                <Eye size={14} />
                <span className="text-xs">{item.stats.views}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Featured badge */}
        {item.isFeatured && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-skinny-yellow text-black text-[10px] font-bold uppercase">
            Featured
          </div>
        )}
      </div>

      {/* Card footer - polaroid style */}
      <div className="p-3 bg-zinc-900">
        <p className="text-xs text-white/80 line-clamp-2 mb-1">{item.prompt}</p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">@{item.creator.username}</span>
          <div className="flex items-center gap-1 text-zinc-500">
            <Heart size={10} fill={isLiked ? '#ef4444' : 'none'} className={isLiked ? 'text-red-400' : ''} />
            <span className="text-[10px]">{item.stats.likes}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
