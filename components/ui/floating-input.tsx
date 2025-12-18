'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ArrowUp, Sparkles, Loader2, Image as ImageIcon, Wand2, X } from 'lucide-react'
import { validateImage, createThumbnailUrl, revokeThumbnailUrl } from '@/lib/image-utils'

interface AttachedImage {
  file: File
  url: string
}

interface FloatingInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  selectedModel: string
  onModelClick: () => void
  isLoading?: boolean
  placeholder?: string
  // Image attachments
  attachedImages?: File[]
  onAttachedImagesChange?: (images: File[]) => void
  // Planning mode
  onPlanningClick?: () => void
}

const MAX_IMAGES = 4
const MAX_CHARS = 2000
const WARN_CHARS = 1500

export function FloatingInput({
  value,
  onChange,
  onSubmit,
  selectedModel,
  onModelClick,
  isLoading = false,
  placeholder = "describe your vision...",
  attachedImages = [],
  onAttachedImagesChange,
  onPlanningClick,
}: FloatingInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [previews, setPreviews] = useState<AttachedImage[]>([])

  // Sync previews with attached images
  useEffect(() => {
    // Clean up old previews
    previews.forEach(p => revokeThumbnailUrl(p.url))

    // Create new previews
    const newPreviews = attachedImages.map(file => ({
      file,
      url: createThumbnailUrl(file),
    }))
    setPreviews(newPreviews)

    return () => {
      newPreviews.forEach(p => revokeThumbnailUrl(p.url))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedImages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isLoading) {
        onSubmit()
      }
    }
  }

  const handleImageUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !onAttachedImagesChange) return

    const files = Array.from(e.target.files)
    const validFiles: File[] = []

    for (const file of files) {
      const validation = validateImage(file)
      if (validation.valid && attachedImages.length + validFiles.length < MAX_IMAGES) {
        validFiles.push(file)
      }
    }

    if (validFiles.length > 0) {
      onAttachedImagesChange([...attachedImages, ...validFiles])
    }

    e.target.value = ''
  }

  const removeImage = (index: number) => {
    if (!onAttachedImagesChange) return
    onAttachedImagesChange(attachedImages.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    onChange('')
    onAttachedImagesChange?.([])
  }

  const charCount = value.length
  const charCountColor = charCount > MAX_CHARS
    ? 'text-red-500'
    : charCount > WARN_CHARS
    ? 'text-skinny-yellow'
    : 'text-zinc-600'

  const hasContent = value.trim() || attachedImages.length > 0
  const canSubmit = value.trim() && !isLoading && charCount <= MAX_CHARS

  return (
    <div className="relative flex-shrink-0 px-4 sm:px-6 pb-6 pt-4">
      {/* Gradient Fade - 200px tall */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none z-0"
        style={{
          height: '200px',
          background: 'linear-gradient(to top, rgb(0, 0, 0) 0%, rgb(0, 0, 0) 40%, rgba(0, 0, 0, 0.8) 70%, transparent 100%)'
        }}
      />

      <div className="max-w-3xl mx-auto w-full relative z-10">
        <motion.div
          className={cn(
            "relative rounded-2xl bg-zinc-900/80 border backdrop-blur-sm overflow-hidden transition-all duration-300",
            isFocused
              ? "border-skinny-yellow/50 shadow-[0_0_30px_rgba(214,252,81,0.15)]"
              : "border-zinc-800/50"
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Attached Images Preview */}
          <AnimatePresence>
            {previews.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex gap-2 p-3 pb-0 flex-wrap">
                  {previews.map((preview, index) => (
                    <motion.div
                      key={preview.url}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group"
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden border-2 border-zinc-700 bg-zinc-800">
                        <img
                          src={preview.url}
                          alt={`Reference ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 w-6 h-6 min-w-[44px] min-h-[44px] -m-[9px] rounded-full bg-red-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  ))}

                  {/* Add More Button */}
                  {attachedImages.length < MAX_IMAGES && (
                    <button
                      onClick={handleImageUpload}
                      className="w-14 h-14 rounded-lg border-2 border-dashed border-zinc-700 hover:border-skinny-yellow/50 flex items-center justify-center text-zinc-500 hover:text-skinny-yellow transition-colors"
                    >
                      <ImageIcon size={18} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Input Area */}
          <div className="flex items-end gap-2 sm:gap-3 p-3">
            {/* Left Tools */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Model Selector */}
              <button
                onClick={onModelClick}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200",
                  "bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-skinny-yellow/30",
                  "text-xs font-bold uppercase tracking-wide"
                )}
              >
                <Sparkles size={14} className="text-skinny-yellow" />
                <span className="text-zinc-300 hidden sm:inline max-w-[100px] truncate">{selectedModel}</span>
              </button>

              {/* Image Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={handleImageUpload}
                disabled={attachedImages.length >= MAX_IMAGES}
                className={cn(
                  "relative p-2 rounded-xl transition-all duration-200",
                  attachedImages.length >= MAX_IMAGES
                    ? "text-zinc-700 cursor-not-allowed"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                )}
                title="Add reference images"
              >
                <ImageIcon size={18} />
                {attachedImages.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-skinny-yellow text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                    {attachedImages.length}
                  </span>
                )}
              </button>

              {/* Planning Mode */}
              {onPlanningClick && (
                <button
                  onClick={onPlanningClick}
                  className="p-2 rounded-xl text-zinc-500 hover:text-skinny-yellow hover:bg-zinc-800 transition-all duration-200"
                  title="AI Planning Mode"
                >
                  <Wand2 size={18} />
                </button>
              )}
            </div>

            {/* Input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                rows={1}
                aria-label="Image generation prompt"
                aria-describedby="input-hints"
                className={cn(
                  "w-full bg-transparent resize-none focus:outline-none text-sm overflow-y-auto py-2 pr-8",
                  "placeholder:text-zinc-600 text-white"
                )}
                style={{ minHeight: '40px', maxHeight: '160px' }}
              />

              {/* Clear Button */}
              <AnimatePresence>
                {hasContent && !isLoading && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={clearAll}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Clear all"
                  >
                    <X size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Generate Button */}
            <motion.button
              onClick={onSubmit}
              disabled={!canSubmit}
              whileHover={{ scale: canSubmit ? 1.05 : 1 }}
              whileTap={{ scale: canSubmit ? 0.95 : 1 }}
              className={cn(
                "flex-shrink-0 p-3 rounded-xl transition-all duration-200",
                canSubmit
                  ? "bg-skinny-yellow text-black hover:bg-skinny-green"
                  : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowUp size={18} />
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Footer Info */}
        <div className="flex items-center justify-between mt-2 px-1" id="input-hints">
          <p className="text-xs text-zinc-600 hidden sm:block">
            <kbd className="text-zinc-500">Enter</kbd> to generate • <kbd className="text-zinc-500">Shift+Enter</kbd> new line
          </p>
          <p className={cn('text-xs transition-colors', charCountColor)} aria-live="polite">
            <span className="sr-only">Character count:</span> {charCount}/{MAX_CHARS}
          </p>
        </div>
      </div>
    </div>
  )
}
