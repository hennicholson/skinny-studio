'use client'

import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { validateImage, createThumbnailUrl, revokeThumbnailUrl } from '@/lib/image-utils'

interface ImageUploadProps {
  images: File[]
  onImagesChange: (images: File[]) => void
  maxImages?: number
  className?: string
}

interface PreviewImage {
  file: File
  url: string
}

export function ImageUpload({
  images,
  onImagesChange,
  maxImages = 4,
  className,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<PreviewImage[]>(() =>
    images.map(file => ({ file, url: createThumbnailUrl(file) }))
  )

  const handleFiles = useCallback((files: FileList | File[]) => {
    setError(null)
    const fileArray = Array.from(files)
    const validFiles: File[] = []

    for (const file of fileArray) {
      const validation = validateImage(file)

      if (!validation.valid) {
        setError(validation.error || 'Invalid file')
        continue
      }

      if (images.length + validFiles.length >= maxImages) {
        setError(`Maximum ${maxImages} images allowed`)
        break
      }

      validFiles.push(file)
    }

    if (validFiles.length > 0) {
      const newPreviews = validFiles.map(file => ({
        file,
        url: createThumbnailUrl(file),
      }))

      setPreviews(prev => [...prev, ...newPreviews])
      onImagesChange([...images, ...validFiles])
    }
  }, [images, maxImages, onImagesChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    const preview = previews[index]
    if (preview) {
      revokeThumbnailUrl(preview.url)
    }

    setPreviews(prev => prev.filter((_, i) => i !== index))
    onImagesChange(images.filter((_, i) => i !== index))
    setError(null)
  }

  const canAddMore = images.length < maxImages

  return (
    <div className={cn('space-y-3', className)}>
      {/* Preview Grid */}
      {previews.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <AnimatePresence mode="popLayout">
            {previews.map((preview, index) => (
              <motion.div
                key={preview.url}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative group"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-zinc-700 bg-zinc-800">
                  <img
                    src={preview.url}
                    alt={`Reference ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 min-w-[44px] min-h-[44px] -m-[9px] rounded-full bg-red-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Drop Zone */}
      {canAddMore && (
        <motion.div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            'relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-skinny-yellow bg-skinny-yellow/10'
              : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2 text-center">
            <div className={cn(
              'p-2 rounded-lg transition-colors',
              isDragging ? 'bg-skinny-yellow/20' : 'bg-zinc-800'
            )}>
              {isDragging ? (
                <Upload size={20} className="text-skinny-yellow" />
              ) : (
                <ImageIcon size={20} className="text-zinc-500" />
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-400">
                {isDragging ? 'Drop images here' : 'Drop reference images or click to browse'}
              </p>
              <p className="text-[11px] sm:text-[10px] text-zinc-600 mt-1">
                {images.length}/{maxImages} images • PNG, JPG, WebP up to 10MB
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 text-red-400 text-xs"
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Compact inline version for the floating input
interface ImageUploadButtonProps {
  images: File[]
  onImagesChange: (images: File[]) => void
  maxImages?: number
}

export function ImageUploadButton({
  images,
  onImagesChange,
  maxImages = 4,
}: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback((files: FileList) => {
    const fileArray = Array.from(files)
    const validFiles: File[] = []

    for (const file of fileArray) {
      const validation = validateImage(file)

      if (!validation.valid) continue

      if (images.length + validFiles.length >= maxImages) break

      validFiles.push(file)
    }

    if (validFiles.length > 0) {
      onImagesChange([...images, ...validFiles])
    }
  }, [images, maxImages, onImagesChange])

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
    e.target.value = ''
  }

  const canAddMore = images.length < maxImages

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleFileInput}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={!canAddMore}
        className={cn(
          'p-2 rounded-lg transition-all duration-200',
          canAddMore
            ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white'
            : 'text-zinc-700 cursor-not-allowed'
        )}
        title={canAddMore ? 'Add reference images' : `Maximum ${maxImages} images`}
      >
        <ImageIcon size={18} />
        {images.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-skinny-yellow text-black text-[10px] font-bold rounded-full flex items-center justify-center">
            {images.length}
          </span>
        )}
      </button>
    </>
  )
}
