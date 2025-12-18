'use client'

import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Share2, Eye, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GalleryItem } from './gallery-card'
import { GalleryDock } from './gallery-dock'
import { LikeButton } from './like-button'

interface GalleryModalProps {
  items: GalleryItem[]
  activeIndex: number
  isOpen: boolean
  onClose: () => void
  onNavigate: (index: number) => void
  onLike: (id: string) => void
  userLikes: Set<string>
}

export function GalleryModal({
  items,
  activeIndex,
  isOpen,
  onClose,
  onNavigate,
  onLike,
  userLikes,
}: GalleryModalProps) {
  const [direction, setDirection] = useState(0)
  const currentItem = items[activeIndex]

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigateNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigatePrev()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, activeIndex, items.length])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const navigateNext = useCallback(() => {
    if (activeIndex < items.length - 1) {
      setDirection(1)
      onNavigate(activeIndex + 1)
    }
  }, [activeIndex, items.length, onNavigate])

  const navigatePrev = useCallback(() => {
    if (activeIndex > 0) {
      setDirection(-1)
      onNavigate(activeIndex - 1)
    }
  }, [activeIndex, onNavigate])

  const handleDownload = async () => {
    if (!currentItem?.imageUrl) return

    try {
      const response = await fetch(currentItem.imageUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentItem.title || 'gallery-image'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const handleShare = async () => {
    try {
      await navigator.share({
        title: currentItem?.title,
        text: currentItem?.prompt,
        url: window.location.href,
      })
    } catch {
      await navigator.clipboard.writeText(window.location.href)
    }
  }

  // Animation variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  }

  const contentVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { type: 'spring' as const, stiffness: 350, damping: 30 }
    },
    exit: { opacity: 0, scale: 0.95 }
  }

  const imageVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { type: 'spring' as const, stiffness: 400, damping: 30 }
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
      transition: { duration: 0.2 }
    })
  }

  if (!currentItem) return null

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            className="absolute inset-0 bg-black/90 backdrop-blur-lg"
            onClick={onClose}
          />

          {/* Close button */}
          <motion.button
            onClick={onClose}
            className="absolute top-4 right-4 z-[70] p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X size={24} />
          </motion.button>

          {/* Navigation arrows */}
          {activeIndex > 0 && (
            <motion.button
              onClick={navigatePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-[70] p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronLeft size={24} />
            </motion.button>
          )}

          {activeIndex < items.length - 1 && (
            <motion.button
              onClick={navigateNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-[70] p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronRight size={24} />
            </motion.button>
          )}

          {/* Main content */}
          <motion.div
            variants={contentVariants}
            className="relative z-[60] flex flex-col lg:flex-row items-center gap-6 max-w-6xl w-full mx-4 max-h-[85vh]"
          >
            {/* Image */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden rounded-2xl">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.img
                  key={currentItem.id}
                  src={currentItem.imageUrl}
                  alt={currentItem.prompt}
                  custom={direction}
                  variants={imageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl"
                  draggable={false}
                />
              </AnimatePresence>
            </div>

            {/* Info panel */}
            <motion.div
              className="lg:w-80 flex-shrink-0 bg-zinc-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 max-h-[70vh] overflow-y-auto"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 350, damping: 30 }}
            >
              {/* Creator */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center">
                  <span className="text-sm font-bold text-black">
                    {currentItem.creator.username[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-white">@{currentItem.creator.username}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(currentItem.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Title */}
              <h2 className="text-lg font-semibold text-white mb-2">{currentItem.title}</h2>

              {/* Prompt */}
              <p className="text-sm text-zinc-400 mb-4 leading-relaxed">{currentItem.prompt}</p>

              {/* Model badge */}
              <div className="flex items-center gap-2 mb-4">
                <Wand2 size={14} className="text-skinny-yellow" />
                <span className="text-xs text-zinc-400">{currentItem.model.name}</span>
              </div>

              {/* Tags */}
              {currentItem.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {currentItem.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-full bg-white/10 text-xs text-white/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 mb-6">
                <LikeButton
                  isLiked={userLikes.has(currentItem.id)}
                  count={currentItem.stats.likes}
                  onToggle={() => onLike(currentItem.id)}
                  size="md"
                />
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Eye size={18} />
                  <span className="text-sm tabular-nums">{currentItem.stats.views}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
                >
                  <Download size={16} />
                  Download
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-skinny-yellow hover:bg-skinny-yellow/90 text-black text-sm font-medium transition-colors"
                >
                  <Share2 size={16} />
                  Share
                </button>
              </div>

              {/* Navigation hint */}
              <p className="text-center text-xs text-zinc-600 mt-4">
                Use ← → arrows to navigate
              </p>
            </motion.div>
          </motion.div>

          {/* Floating dock */}
          <GalleryDock
            items={items}
            activeIndex={activeIndex}
            onSelect={(index) => {
              setDirection(index > activeIndex ? 1 : -1)
              onNavigate(index)
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
