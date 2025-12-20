'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Generic skeleton pulse animation
const pulseAnimation = {
  opacity: [0.4, 0.7, 0.4],
  transition: {
    duration: 1.5,
    repeat: Infinity,
    ease: 'easeInOut' as const,
  },
}

// Shot list skeleton
export function ShotListSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          animate={pulseAnimation}
          className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50"
        >
          <div className="w-6 h-6 rounded bg-zinc-700" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-zinc-700" />
            <div className="h-2 w-32 rounded bg-zinc-700" />
          </div>
          <div className="w-16 h-6 rounded bg-zinc-700" />
        </motion.div>
      ))}
    </div>
  )
}

// Entity panel skeleton
export function EntityPanelSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <div className="h-8 w-full rounded-lg bg-zinc-800" />
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          animate={pulseAnimation}
          className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50"
        >
          <div className="w-12 h-12 rounded-lg bg-zinc-700" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-20 rounded bg-zinc-700" />
            <div className="h-2 w-28 rounded bg-zinc-700" />
          </div>
          <div className="w-5 h-5 rounded-full bg-zinc-700" />
        </motion.div>
      ))}
    </div>
  )
}

// Timeline skeleton
export function TimelineSkeleton() {
  return (
    <div className="flex gap-3 p-4 overflow-hidden">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          animate={pulseAnimation}
          className={cn(
            "flex-shrink-0 w-32 aspect-video rounded-lg bg-zinc-800",
            i === 0 && "ml-2"
          )}
        />
      ))}
    </div>
  )
}

// Chat skeleton
export function ChatSkeleton() {
  return (
    <div className="flex-1 flex flex-col p-4 space-y-4">
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          animate={pulseAnimation}
          className={cn(
            "flex gap-3",
            i % 2 === 1 ? "justify-end" : "justify-start"
          )}
        >
          {i % 2 === 0 && <div className="w-8 h-8 rounded-full bg-zinc-800" />}
          <div
            className={cn(
              "rounded-2xl p-4 space-y-2",
              i % 2 === 1 ? "bg-zinc-700/50" : "bg-zinc-800/50"
            )}
            style={{ width: `${60 + (i * 10)}%` }}
          >
            <div className="h-3 w-full rounded bg-zinc-700" />
            <div className="h-3 w-3/4 rounded bg-zinc-700" />
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// Empty state component
interface EmptyStateProps {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
        <Icon size={24} className="text-zinc-500" />
      </div>
      <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 max-w-[200px] mb-4">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium text-black bg-skinny-yellow rounded-lg hover:bg-skinny-green transition-colors"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}

// Error state component
interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="w-14 h-14 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 max-w-[200px] mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Try Again
        </button>
      )}
    </motion.div>
  )
}

// Loading spinner
export function LoadingSpinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' as const }}
      className={cn("border-2 border-zinc-700 border-t-skinny-yellow rounded-full", className)}
      style={{ width: size, height: size }}
    />
  )
}
