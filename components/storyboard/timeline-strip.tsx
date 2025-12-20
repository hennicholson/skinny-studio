'use client'

import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Play, Image, Video, Check, Clock, AlertCircle, ChevronLeft, ChevronRight, Expand, Film, Loader2 } from 'lucide-react'
import { StoryboardShot, StoryboardEntity } from '@/lib/types'
import { EntityTypeBadge } from './entity-type-badge'
import { TimelineSkeleton } from './storyboard-skeleton'

interface TimelineStripProps {
  shots: StoryboardShot[]
  entities: StoryboardEntity[]
  selectedShotId?: string
  onSelectShot: (shotId: string) => void
  onGenerateShot: (shotId: string) => void
  onExpandTimeline?: () => void
  isLoading?: boolean
}

interface TimelineShotCardProps {
  shot: StoryboardShot
  isSelected: boolean
  onSelect: () => void
  onGenerate: () => void
}

function TimelineShotCard({
  shot,
  isSelected,
  onSelect,
  onGenerate,
}: TimelineShotCardProps) {
  // Get entities associated with this shot
  const shotEntities = shot.entities
    ?.map(ref => ref.entity)
    .filter((e): e is StoryboardEntity => e !== undefined) || []

  const getStatusOverlay = () => {
    switch (shot.status) {
      case 'completed':
        return (
          <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check size={12} className="text-green-400" />
            </div>
          </div>
        )
      case 'generating':
        return (
          <div className="absolute inset-0 bg-skinny-yellow/10 flex items-center justify-center">
            <Clock size={14} className="text-skinny-yellow animate-pulse" />
          </div>
        )
      case 'error':
        return (
          <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
            <AlertCircle size={14} className="text-red-400" />
          </div>
        )
      default:
        return (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onGenerate()
              }}
              className="w-8 h-8 rounded-full bg-skinny-yellow/20 hover:bg-skinny-yellow/30 flex items-center justify-center transition-colors"
            >
              <Play size={14} className="text-skinny-yellow ml-0.5" />
            </button>
          </div>
        )
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
      className={cn(
        "group relative flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden cursor-pointer transition-all",
        "border-2",
        isSelected
          ? "border-skinny-yellow shadow-lg shadow-skinny-yellow/20"
          : shot.status === 'completed'
          ? "border-green-500/30 hover:border-green-500/50"
          : shot.status === 'generating'
          ? "border-yellow-500/30"
          : shot.status === 'error'
          ? "border-red-500/30 hover:border-red-500/50"
          : "border-zinc-700 hover:border-zinc-600"
      )}
      onClick={onSelect}
    >
      {/* Background - show thumbnail if completed, otherwise placeholder */}
      <div className="absolute inset-0 bg-zinc-800">
        {shot.status === 'completed' && shot.generatedImageUrl ? (
          // Show actual generated image
          <img
            src={shot.generatedImageUrl}
            alt={shot.title || `Shot ${shot.shotNumber}`}
            className="w-full h-full object-cover"
          />
        ) : shot.status === 'generating' ? (
          // Show loading spinner
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-yellow-900/20 to-zinc-900">
            <Loader2 size={24} className="text-skinny-yellow animate-spin" />
          </div>
        ) : (
          // Show placeholder with media type icon
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            {shot.mediaType === 'video' ? (
              <Video size={20} className="text-zinc-600" />
            ) : (
              <Image size={20} className="text-zinc-600" />
            )}
          </div>
        )}
      </div>

      {/* Status Overlay */}
      {getStatusOverlay()}

      {/* Shot Number */}
      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white">
        {String(shot.shotNumber).padStart(2, '0')}
      </div>

      {/* Entity Indicators */}
      {shotEntities.length > 0 && (
        <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 overflow-hidden">
          {shotEntities.slice(0, 3).map((entity, idx) => (
            <div
              key={entity.id}
              className={cn(
                "w-3 h-3 rounded-sm flex items-center justify-center",
                entity.entityType === 'character' && "bg-blue-500/40",
                entity.entityType === 'world' && "bg-green-500/40",
                entity.entityType === 'object' && "bg-orange-500/40",
                entity.entityType === 'style' && "bg-purple-500/40"
              )}
            >
              <span className="text-[8px] text-white font-bold">
                {entity.entityName[0].toUpperCase()}
              </span>
            </div>
          ))}
          {shotEntities.length > 3 && (
            <div className="w-3 h-3 rounded-sm bg-zinc-700/60 flex items-center justify-center">
              <span className="text-[8px] text-zinc-400">+</span>
            </div>
          )}
        </div>
      )}

      {/* Selection Ring Animation */}
      {isSelected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 pointer-events-none"
        >
          <div className="absolute inset-0 rounded-lg ring-2 ring-skinny-yellow ring-offset-2 ring-offset-black" />
        </motion.div>
      )}
    </motion.div>
  )
}

export function TimelineStrip({
  shots,
  entities,
  selectedShotId,
  onSelectShot,
  onGenerateShot,
  onExpandTimeline,
  isLoading,
}: TimelineStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const sortedShots = [...shots].sort((a, b) => a.sortOrder - b.sortOrder)

  // Check scroll position
  const updateScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  useEffect(() => {
    updateScrollButtons()
    const ref = scrollRef.current
    if (ref) {
      ref.addEventListener('scroll', updateScrollButtons)
      window.addEventListener('resize', updateScrollButtons)
    }
    return () => {
      if (ref) {
        ref.removeEventListener('scroll', updateScrollButtons)
      }
      window.removeEventListener('resize', updateScrollButtons)
    }
  }, [shots])

  // Scroll selected shot into view
  useEffect(() => {
    if (selectedShotId && scrollRef.current) {
      const selectedElement = scrollRef.current.querySelector(`[data-shot-id="${selectedShotId}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [selectedShotId])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex-shrink-0 h-28 border-t border-zinc-800 bg-zinc-950/50">
        <TimelineSkeleton />
      </div>
    )
  }

  if (sortedShots.length === 0) {
    return (
      <div className="flex-shrink-0 h-24 border-t border-zinc-800 bg-zinc-950/50">
        <div className="flex items-center justify-center h-full text-xs text-zinc-500">
          <Film size={14} className="mr-2 text-zinc-600" />
          Timeline will show generated shots here
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 h-28 border-t border-zinc-800 bg-zinc-950/50 relative">
      {/* Scroll Left Button */}
      <AnimatePresence>
        {canScrollLeft && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-zinc-950 to-transparent flex items-center justify-start pl-2"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
              <ChevronLeft size={16} className="text-white" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Scroll Right Button */}
      <AnimatePresence>
        {canScrollRight && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-zinc-950 to-transparent flex items-center justify-end pr-2"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
              <ChevronRight size={16} className="text-white" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Timeline Content */}
      <div
        ref={scrollRef}
        className="flex items-center h-full px-4 gap-3 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <AnimatePresence mode="popLayout">
          {sortedShots.map((shot) => (
            <div key={shot.id} data-shot-id={shot.id}>
              <TimelineShotCard
                shot={shot}
                isSelected={shot.id === selectedShotId}
                onSelect={() => onSelectShot(shot.id)}
                onGenerate={() => onGenerateShot(shot.id)}
              />
            </div>
          ))}
        </AnimatePresence>

        {/* Add Shot Placeholder */}
        <div className="flex-shrink-0 w-28 h-28 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center hover:border-zinc-600 transition-colors cursor-pointer">
          <span className="text-lg text-zinc-600">+</span>
        </div>
      </div>

      {/* Expand Button */}
      {onExpandTimeline && (
        <button
          onClick={onExpandTimeline}
          className="absolute right-4 top-1 p-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
          title="Expand timeline"
        >
          <Expand size={12} />
        </button>
      )}

      {/* Shot Count */}
      <div className="absolute left-4 top-1 text-[10px] font-mono text-zinc-600">
        {sortedShots.length} shots
      </div>
    </div>
  )
}
