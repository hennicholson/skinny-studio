'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, AlertCircle, Image as ImageIcon, Video, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GenerationNotification {
  id: string
  type: 'image' | 'video' | 'training'
  status: 'completed' | 'failed' | 'generating'
  model: string
  modelName?: string
  cost?: number // cents charged
  outputUrl?: string
  generationId?: string
  message?: string
  timestamp: Date
}

interface GenerationToastProps {
  notification: GenerationNotification
  onDismiss: (id: string) => void
  onView?: (generationId: string) => void
  className?: string
}

/**
 * Single Generation Toast
 *
 * Shows notification for a generation completion/failure.
 */
export function GenerationToast({
  notification,
  onDismiss,
  onView,
  className,
}: GenerationToastProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Auto-dismiss after 5 seconds (unless hovered)
  useEffect(() => {
    if (notification.status !== 'generating' && !isHovered) {
      const timer = setTimeout(() => {
        onDismiss(notification.id)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [notification.id, notification.status, isHovered, onDismiss])

  const getIcon = () => {
    if (notification.status === 'generating') {
      return <Loader2 size={18} className="text-skinny-yellow animate-spin" />
    }
    if (notification.status === 'failed') {
      return <AlertCircle size={18} className="text-red-400" />
    }
    if (notification.type === 'video') {
      return <Video size={18} className="text-green-400" />
    }
    return <ImageIcon size={18} className="text-green-400" />
  }

  const getTitle = () => {
    if (notification.status === 'generating') {
      return 'Generating...'
    }
    if (notification.status === 'failed') {
      return 'Generation Failed'
    }
    return notification.type === 'video' ? 'Video Ready' : 'Image Ready'
  }

  const getStatusColor = () => {
    if (notification.status === 'generating') return 'border-skinny-yellow/30'
    if (notification.status === 'failed') return 'border-red-500/30'
    return 'border-green-500/30'
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "relative w-80 rounded-xl overflow-hidden",
        "bg-zinc-900/95 backdrop-blur-xl",
        "border",
        getStatusColor(),
        "shadow-2xl",
        className
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-white">
                {getTitle()}
              </h4>
              <button
                onClick={() => onDismiss(notification.id)}
                className="p-1 rounded text-white/30 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-white/50 mt-0.5">
              {notification.modelName || notification.model}
            </p>

            {notification.message && notification.status === 'failed' && (
              <p className="text-xs text-red-400/80 mt-1 line-clamp-2">
                {notification.message}
              </p>
            )}

            {notification.status === 'completed' && notification.cost && (
              <p className="text-xs text-white/40 mt-1">
                ${(notification.cost / 100).toFixed(2)} charged
              </p>
            )}
          </div>
        </div>

        {/* Thumbnail Preview */}
        {notification.status === 'completed' && notification.outputUrl && (
          <div className="mt-3 flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/[0.05] flex-shrink-0">
              {notification.type === 'video' ? (
                <video
                  src={notification.outputUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={notification.outputUrl}
                  alt="Generated"
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {notification.generationId && onView && (
              <button
                onClick={() => onView(notification.generationId!)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
              >
                <ExternalLink size={12} />
                View
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress bar for generating */}
      {notification.status === 'generating' && (
        <div className="h-0.5 bg-white/[0.05]">
          <motion.div
            className="h-full bg-skinny-yellow"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 30, ease: 'linear' }}
          />
        </div>
      )}
    </motion.div>
  )
}

interface GenerationToastContainerProps {
  notifications: GenerationNotification[]
  onDismiss: (id: string) => void
  onView?: (generationId: string) => void
}

/**
 * Generation Toast Container
 *
 * Stacks multiple generation notifications in the bottom-right corner.
 */
export function GenerationToastContainer({
  notifications,
  onDismiss,
  onView,
}: GenerationToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {notifications.slice(0, 5).map((notification) => (
          <div key={notification.id} className="pointer-events-auto">
            <GenerationToast
              notification={notification}
              onDismiss={onDismiss}
              onView={onView}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default GenerationToastContainer
