'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Download, Share2, Bookmark, Heart, Copy, Check, X, ExternalLink } from 'lucide-react'
import { Generation } from '@/lib/mock-data'

interface GenerationCardProps {
  generation: Generation
  onSaveToWorkflow?: (id: string) => void
  onShare?: (id: string) => void
}

export function GenerationCard({ generation, onSaveToWorkflow, onShare }: GenerationCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generation.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy prompt:', err)
    }
  }, [generation.prompt])

  // Handle keyboard navigation in modal
  useEffect(() => {
    if (!showDetails) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowDetails(false)
      }
    }

    // Focus close button when modal opens
    setTimeout(() => closeButtonRef.current?.focus(), 100)

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showDetails])

  // Handle card keyboard interaction
  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setShowDetails(true)
    }
  }

  return (
    <>
      <motion.article
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        onClick={() => setShowDetails(true)}
        onKeyDown={handleCardKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`View details for generation: ${generation.prompt.slice(0, 50)}...`}
        className={cn(
          "group relative overflow-hidden rounded-2xl cursor-pointer",
          "bg-zinc-900 border-2 border-zinc-800",
          "transition-all duration-300",
          "hover:border-skinny-yellow/50",
          "hover:shadow-[0_0_30px_rgba(214,252,81,0.15)]",
          "focus:outline-none focus:border-skinny-yellow focus:ring-2 focus:ring-skinny-yellow/30"
        )}
      >
        {/* Image */}
        <div className="relative overflow-hidden">
          <img
            src={generation.imageUrl}
            alt={generation.prompt}
            className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />

          {/* Model Badge */}
          <div className="absolute top-3 left-3">
            <span className="px-2.5 py-1 rounded-full bg-skinny-yellow text-black text-[11px] sm:text-[10px] font-bold uppercase tracking-wide">
              {generation.modelName || generation.model?.name}
            </span>
          </div>

          {/* Likes Badge */}
          {generation.likes && generation.likes > 0 && (
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm">
              <Heart size={12} className="text-red-500 fill-red-500" />
              <span className="text-xs text-white font-medium">{generation.likes}</span>
            </div>
          )}

          {/* Hover Overlay - always visible on mobile, hover on desktop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0 }}
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
              {/* Prompt Preview */}
              <p className="text-sm text-white line-clamp-2 mb-3">
                {generation.prompt}
              </p>

              {/* Actions - 44px minimum touch targets */}
              <div className="flex gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => window.open(generation.imageUrl, '_blank')}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-skinny-yellow hover:text-black text-white transition-all"
                  title="Download"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => onShare?.(generation.id)}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-skinny-yellow hover:text-black text-white transition-all"
                  title="Share"
                >
                  <Share2 size={18} />
                </button>
                <button
                  onClick={() => onSaveToWorkflow?.(generation.id)}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-skinny-yellow hover:text-black text-white transition-all"
                  title="Save to Workflow"
                >
                  <Bookmark size={18} />
                </button>
                <button
                  onClick={copyPrompt}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-skinny-yellow hover:text-black text-white transition-all ml-auto"
                  title="Copy Prompt"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.article>

      {/* Details Modal */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDetails(false)}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generation-modal-title"
          >
            <motion.div
              ref={modalRef}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.3}
              onDragEnd={(event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                // Swipe down to dismiss
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  setShowDetails(false)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-zinc-900 border-2 border-zinc-800 rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col md:flex-row touch-pan-x"
            >
              {/* Drag handle indicator - mobile only */}
              <div className="md:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-600 rounded-full z-20" />
              {/* Close Button */}
              <button
                ref={closeButtonRef}
                onClick={() => setShowDetails(false)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-black/50 hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-skinny-yellow"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>

              {/* Image */}
              <div className="md:w-2/3 bg-black flex items-center justify-center">
                <img
                  src={generation.imageUrl}
                  alt={generation.prompt}
                  className="max-w-full max-h-[60vh] md:max-h-[80vh] object-contain"
                />
              </div>

              {/* Details */}
              <div className="md:w-1/3 p-4 sm:p-6 overflow-y-auto">
                <h2 id="generation-modal-title" className="sr-only">Generation Details</h2>

                {/* Model */}
                <div className="mb-6">
                  <span className="px-3 py-1.5 rounded-full bg-skinny-yellow text-black text-xs font-bold uppercase">
                    {generation.modelName || generation.model?.name}
                  </span>
                  {generation.model?.provider && (
                    <p className="text-xs text-zinc-500 mt-2">{generation.model.provider}</p>
                  )}
                </div>

                {/* Prompt */}
                <div className="mb-6">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Prompt</h3>
                  <p className="text-sm text-white leading-relaxed">{generation.prompt}</p>
                  <button
                    onClick={copyPrompt}
                    className="mt-3 flex items-center gap-2 text-xs text-skinny-yellow hover:text-skinny-green transition-colors"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy prompt'}
                  </button>
                </div>

                {/* Date */}
                <div className="mb-6">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Created</h3>
                  <p className="text-sm text-zinc-400">
                    {(generation.timestamp || generation.createdAt)?.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => window.open(generation.imageUrl, '_blank')}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-skinny-yellow text-black font-bold text-sm uppercase hover:bg-skinny-green transition-colors"
                  >
                    <Download size={16} />
                    Download
                  </button>
                  <button
                    onClick={() => onSaveToWorkflow?.(generation.id)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-zinc-700 text-white font-bold text-sm uppercase hover:border-skinny-yellow/50 transition-colors"
                  >
                    <Bookmark size={16} />
                    Save to Workflow
                  </button>
                  <button
                    onClick={() => onShare?.(generation.id)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-zinc-700 text-white font-bold text-sm uppercase hover:border-skinny-yellow/50 transition-colors"
                  >
                    <ExternalLink size={16} />
                    Share
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
