'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  MessageSquare,
  Maximize2,
  Minimize2,
  Film,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { StoryboardShot, StoryboardEntity } from '@/lib/types'
import { EntityTypeBadge } from './entity-type-badge'
import { StoryboardChat } from './storyboard-chat'

interface ShotSlideshowModalProps {
  isOpen: boolean
  onClose: () => void
  shots: StoryboardShot[]
  entities: StoryboardEntity[]
  initialShotId?: string
  onShotChange?: (shotId: string) => void
}

export function ShotSlideshowModal({
  isOpen,
  onClose,
  shots,
  entities,
  initialShotId,
  onShotChange,
}: ShotSlideshowModalProps) {
  const [mounted, setMounted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playInterval, setPlayInterval] = useState(4000) // 4 seconds default
  const [chatOpen, setChatOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showInfo, setShowInfo] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Filter to only completed shots with images
  const completedShots = shots.filter(
    (s) => s.status === 'completed' && s.generatedImageUrl
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  // Set initial index when modal opens
  useEffect(() => {
    if (isOpen && initialShotId) {
      const index = completedShots.findIndex((s) => s.id === initialShotId)
      if (index >= 0) {
        setCurrentIndex(index)
      }
    }
  }, [isOpen, initialShotId, completedShots])

  // Auto-play logic
  useEffect(() => {
    if (isPlaying && completedShots.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % completedShots.length)
      }, playInterval)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, completedShots.length, playInterval])

  // Notify parent of shot change
  useEffect(() => {
    if (completedShots[currentIndex] && onShotChange) {
      onShotChange(completedShots[currentIndex].id)
    }
  }, [currentIndex, completedShots, onShotChange])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          if (chatOpen) {
            setChatOpen(false)
          } else {
            onClose()
          }
          break
        case 'ArrowLeft':
          goToPrev()
          break
        case 'ArrowRight':
          goToNext()
          break
        case ' ':
          e.preventDefault()
          setIsPlaying((prev) => !prev)
          break
        case 'f':
          toggleFullscreen()
          break
        case 'c':
          setChatOpen((prev) => !prev)
          break
        case 'i':
          setShowInfo((prev) => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, chatOpen, onClose])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % completedShots.length)
  }, [completedShots.length])

  const goToPrev = useCallback(() => {
    setCurrentIndex(
      (prev) => (prev - 1 + completedShots.length) % completedShots.length
    )
  }, [completedShots.length])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  if (!mounted) return null

  const currentShot = completedShots[currentIndex]

  // Get entities for current shot
  const shotEntities =
    currentShot?.entities
      ?.map((ref) =>
        entities.find((e) => e.id === ref.entityId)
      )
      .filter(Boolean) || []

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black"
        >
          {/* Main content area */}
          <div className="relative w-full h-full flex">
            {/* Slideshow area */}
            <div
              className={cn(
                'flex-1 relative flex flex-col',
                chatOpen ? 'mr-96' : ''
              )}
            >
              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center gap-4">
                  {/* Close button */}
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    <X size={20} />
                  </button>

                  {/* Shot counter */}
                  <span className="text-white text-sm font-medium">
                    Shot {currentIndex + 1} of {completedShots.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Info toggle */}
                  <button
                    onClick={() => setShowInfo(!showInfo)}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      showInfo
                        ? 'bg-skinny-yellow text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    )}
                    title="Toggle info (I)"
                  >
                    <Info size={18} />
                  </button>

                  {/* Chat toggle */}
                  <button
                    onClick={() => setChatOpen(!chatOpen)}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      chatOpen
                        ? 'bg-skinny-yellow text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    )}
                    title="Toggle chat (C)"
                  >
                    <MessageSquare size={18} />
                  </button>

                  {/* Fullscreen toggle */}
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Toggle fullscreen (F)"
                  >
                    {isFullscreen ? (
                      <Minimize2 size={18} />
                    ) : (
                      <Maximize2 size={18} />
                    )}
                  </button>
                </div>
              </div>

              {/* Image area */}
              {completedShots.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-white">
                  <Film size={48} className="text-zinc-600 mb-4" />
                  <p className="text-lg text-zinc-400">
                    No generated shots yet
                  </p>
                  <p className="text-sm text-zinc-600">
                    Generate some shots first to preview them here
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center relative">
                  {/* Current shot image */}
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={currentShot?.id}
                      src={currentShot?.generatedImageUrl}
                      alt={currentShot?.title || `Shot ${currentShot?.shotNumber}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      transition={{ duration: 0.3 }}
                      className="max-w-full max-h-full object-contain"
                    />
                  </AnimatePresence>

                  {/* Navigation arrows */}
                  {completedShots.length > 1 && (
                    <>
                      <button
                        onClick={goToPrev}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        onClick={goToNext}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Bottom bar with info and controls */}
              <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 to-transparent">
                {/* Shot info */}
                <AnimatePresence>
                  {showInfo && currentShot && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="px-6 py-4 border-b border-white/10"
                    >
                      {/* Title & number */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 rounded bg-white/10 text-white text-sm font-mono">
                          {String(currentShot.shotNumber).padStart(2, '0')}
                        </span>
                        {currentShot.title && (
                          <h3 className="text-lg font-semibold text-white">
                            {currentShot.title}
                          </h3>
                        )}
                      </div>

                      {/* Description */}
                      {currentShot.description && (
                        <p className="text-sm text-zinc-400 mb-2 line-clamp-2">
                          {currentShot.description}
                        </p>
                      )}

                      {/* Entities */}
                      {shotEntities.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {shotEntities.map((entity) =>
                            entity ? (
                              <EntityTypeBadge
                                key={entity.id}
                                type={entity.entityType}
                                name={entity.entityName}
                                size="sm"
                              />
                            ) : null
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Playback controls */}
                <div className="px-6 py-4 flex items-center justify-between">
                  {/* Play/Pause */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      disabled={completedShots.length <= 1}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors',
                        isPlaying
                          ? 'bg-skinny-yellow text-black'
                          : 'bg-white/10 text-white hover:bg-white/20',
                        completedShots.length <= 1 &&
                          'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>

                    {/* Interval selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Speed:</span>
                      {[2000, 4000, 6000].map((interval) => (
                        <button
                          key={interval}
                          onClick={() => setPlayInterval(interval)}
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium transition-colors',
                            playInterval === interval
                              ? 'bg-white/20 text-white'
                              : 'text-zinc-500 hover:text-white'
                          )}
                        >
                          {interval / 1000}s
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Shot indicators */}
                  <div className="flex items-center gap-1">
                    {completedShots.slice(0, 20).map((shot, index) => (
                      <button
                        key={shot.id}
                        onClick={() => setCurrentIndex(index)}
                        className={cn(
                          'w-2 h-2 rounded-full transition-all',
                          index === currentIndex
                            ? 'bg-skinny-yellow scale-125'
                            : 'bg-white/30 hover:bg-white/50'
                        )}
                      />
                    ))}
                    {completedShots.length > 20 && (
                      <span className="text-xs text-zinc-500 ml-2">
                        +{completedShots.length - 20}
                      </span>
                    )}
                  </div>

                  {/* Keyboard hints */}
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-400">
                        Space
                      </kbd>{' '}
                      Play/Pause
                    </span>
                    <span>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-400">
                        ←→
                      </kbd>{' '}
                      Navigate
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat overlay panel */}
            <AnimatePresence>
              {chatOpen && (
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute right-0 top-0 bottom-0 w-96 bg-zinc-900/95 backdrop-blur-xl border-l border-white/10 flex flex-col z-30"
                >
                  {/* Chat header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <span className="text-sm font-medium text-white">
                      Storyboard Chat
                    </span>
                    <button
                      onClick={() => setChatOpen(false)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Chat content */}
                  <div className="flex-1 overflow-hidden">
                    <StoryboardChat />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}
