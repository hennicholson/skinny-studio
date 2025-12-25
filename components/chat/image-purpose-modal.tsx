'use client'

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Image as ImageIcon, Video, Pencil, Film, Sparkles } from 'lucide-react'
import { ImagePurpose, IMAGE_PURPOSE_LABELS, IMAGE_PURPOSE_DESCRIPTIONS } from '@/lib/context/chat-context'
import { cn } from '@/lib/utils'

interface ImagePurposeModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (purpose: ImagePurpose) => void
  imageUrl: string
  imageName: string
}

const PURPOSE_OPTIONS: Array<{
  purpose: ImagePurpose
  key: string
  icon: typeof ImageIcon
  color: string
}> = [
  { purpose: 'reference', key: 'R', icon: ImageIcon, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { purpose: 'starting_frame', key: 'S', icon: Video, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { purpose: 'edit_target', key: 'E', icon: Pencil, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { purpose: 'last_frame', key: 'L', icon: Film, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  { purpose: 'analyze', key: 'A', icon: Sparkles, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
]

export function ImagePurposeModal({
  isOpen,
  onClose,
  onSelect,
  imageUrl,
  imageName,
}: ImagePurposeModalProps) {

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return

    const key = e.key.toUpperCase()

    if (key === 'ESCAPE') {
      onClose()
      return
    }

    const option = PURPOSE_OPTIONS.find(o => o.key === key)
    if (option) {
      onSelect(option.purpose)
    }
  }, [isOpen, onClose, onSelect])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal Container - Full screen flex centering */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto">
              {/* Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-white font-semibold">What's this image for?</h3>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X size={18} className="text-zinc-400" />
                </button>
              </div>

              {/* Image Preview */}
              <div className="p-4 flex justify-center border-b border-zinc-800">
                <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-zinc-800">
                  <img
                    src={imageUrl}
                    alt={imageName}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Purpose Options */}
              <div className="p-4 space-y-2">
                {PURPOSE_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.purpose}
                      onClick={() => onSelect(option.purpose)}
                      className={cn(
                        "w-full p-3 rounded-xl border transition-all",
                        "hover:scale-[1.02] active:scale-[0.98]",
                        "flex items-center gap-3",
                        option.color
                      )}
                    >
                      {/* Hotkey Badge */}
                      <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center">
                        <span className="font-mono font-bold text-sm">{option.key}</span>
                      </div>

                      {/* Icon */}
                      <Icon size={20} />

                      {/* Text */}
                      <div className="flex-1 text-left">
                        <p className="font-medium text-white text-sm">
                          {IMAGE_PURPOSE_LABELS[option.purpose]}
                        </p>
                        <p className="text-xs opacity-60">
                          {IMAGE_PURPOSE_DESCRIPTIONS[option.purpose]}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="px-4 pb-4">
                <p className="text-xs text-zinc-500 text-center">
                  Press key or click to select. <span className="text-zinc-400">Esc</span> to cancel.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
