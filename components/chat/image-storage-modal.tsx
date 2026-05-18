'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Cloud, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadLocalImage } from '@/lib/image-utils'

interface ImageStorageModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (url: string, savedToHub: boolean) => void
  file: File | null
  previewUrl: string
}

const STORAGE_OPTIONS = [
  {
    id: 'hub' as const,
    key: 'H',
    icon: Cloud,
    title: 'Save to Skinny Hub',
    description: 'Store permanently in your library for reuse',
    color: 'text-skinny-lime bg-skinny-lime/10 border-skinny-lime/30',
  },
  {
    id: 'temp' as const,
    key: 'T',
    icon: Clock,
    title: 'Use Temporarily',
    description: 'Upload for this generation only',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
]

export function ImageStorageModal({
  isOpen,
  onClose,
  onComplete,
  file,
  previewUrl,
}: ImageStorageModalProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsUploading(false)
      setError(null)
    }
  }, [isOpen])

  const handleSelect = async (permanent: boolean) => {
    if (!file) return

    setIsUploading(true)
    setError(null)

    try {
      const url = await uploadLocalImage(file, permanent)
      onComplete(url, permanent)
    } catch (err) {
      console.error('Upload failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload image')
      setIsUploading(false)
    }
  }

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen || isUploading) return

    const key = e.key.toUpperCase()

    if (key === 'ESCAPE') {
      onClose()
      return
    }

    if (key === 'H') {
      handleSelect(true)
    } else if (key === 'T') {
      handleSelect(false)
    }
  }, [isOpen, isUploading, onClose, file])

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
            onClick={!isUploading ? onClose : undefined}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl w-full max-w-md pointer-events-auto">
              {/* Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-white font-semibold">Where to store this image?</h3>
                {!isUploading && (
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <X size={18} className="text-zinc-400" />
                  </button>
                )}
              </div>

              {/* Image Preview */}
              <div className="p-4 flex justify-center border-b border-zinc-800">
                <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-zinc-800">
                  <img
                    src={previewUrl}
                    alt="Upload preview"
                    className="w-full h-full object-cover"
                  />
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 size={24} className="text-white animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="px-4 pt-3">
                  <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
              )}

              {/* Storage Options */}
              <div className="p-4 space-y-2">
                {STORAGE_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleSelect(option.id === 'hub')}
                      disabled={isUploading}
                      className={cn(
                        "w-full p-3 rounded-xl border transition-all",
                        "hover:scale-[1.02] active:scale-[0.98]",
                        "flex items-center gap-3",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
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
                          {option.title}
                        </p>
                        <p className="text-xs opacity-60">
                          {option.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="px-4 pb-4">
                <p className="text-xs text-zinc-500 text-center">
                  {isUploading ? (
                    <span className="text-skinny-lime">Uploading...</span>
                  ) : (
                    <>Press key or click to select. <span className="text-zinc-400">Esc</span> to cancel.</>
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
