'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface SegmentOption {
  id: string
  label: string
  icon?: React.ReactNode
  description?: string
}

interface LiquidSegmentedControlProps {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
  fullWidth?: boolean
}

export function LiquidSegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  className,
  fullWidth = false,
}: LiquidSegmentedControlProps) {
  const sizeClasses = {
    sm: {
      container: 'h-8 p-0.5 gap-0.5',
      item: 'px-2.5 py-1 text-xs',
      icon: 'w-3 h-3',
    },
    md: {
      container: 'h-10 p-1 gap-1',
      item: 'px-4 py-1.5 text-sm',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'h-12 p-1 gap-1',
      item: 'px-5 py-2 text-base',
      icon: 'w-5 h-5',
    },
  }

  const classes = sizeClasses[size]

  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-xl',
        'bg-zinc-800/80 backdrop-blur-md border border-white/10',
        'shadow-lg',
        classes.container,
        fullWidth && 'w-full',
        className
      )}
    >
      {options.map((option, index) => {
        const isActive = option.id === value

        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              'relative flex items-center justify-center gap-2 rounded-lg font-medium',
              'transition-colors duration-200',
              classes.item,
              fullWidth && 'flex-1',
              isActive
                ? 'text-black'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            )}
          >
            {/* Active background with animation */}
            {isActive && (
              <motion.div
                layoutId="segmented-active-bg"
                className={cn(
                  'absolute inset-0 rounded-lg',
                  'bg-gradient-to-br from-skinny-yellow to-skinny-yellow/80',
                  'shadow-lg shadow-skinny-yellow/30'
                )}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}

            {/* Content */}
            <span className="relative z-10 flex items-center gap-2">
              {option.icon && (
                <span className={classes.icon}>{option.icon}</span>
              )}
              <span>{option.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Compact version for toolbars
interface CompactSegmentedControlProps {
  options: { id: string; icon: React.ReactNode; tooltip?: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function CompactSegmentedControl({
  options,
  value,
  onChange,
  className,
}: CompactSegmentedControlProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-1 rounded-xl',
        'bg-zinc-800/80 backdrop-blur-md border border-white/10',
        className
      )}
    >
      {options.map((option) => {
        const isActive = option.id === value

        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            title={option.tooltip}
            className={cn(
              'relative p-2 rounded-lg transition-colors duration-200',
              isActive
                ? 'text-black'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="compact-segmented-bg"
                className="absolute inset-0 rounded-lg bg-skinny-yellow shadow-lg shadow-skinny-yellow/30"
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10 w-4 h-4 flex items-center justify-center">
              {option.icon}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Pill-style for mode selection
interface ModeSelectorProps {
  options: { id: string; label: string; icon?: React.ReactNode; badge?: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function ModeSelector({
  options,
  value,
  onChange,
  className,
}: ModeSelectorProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 p-1.5 rounded-2xl',
        'bg-zinc-900/90 backdrop-blur-xl border border-white/5',
        'shadow-2xl',
        className
      )}
    >
      {options.map((option) => {
        const isActive = option.id === value

        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm',
              'transition-all duration-300',
              isActive
                ? 'text-black'
                : 'text-zinc-500 hover:text-white'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="mode-selector-bg"
                className={cn(
                  'absolute inset-0 rounded-xl',
                  'bg-gradient-to-br from-skinny-yellow via-skinny-yellow to-skinny-green/80',
                  'shadow-xl shadow-skinny-yellow/40'
                )}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}

            <span className="relative z-10 flex items-center gap-2">
              {option.icon}
              <span>{option.label}</span>
              {option.badge && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-bold rounded-md',
                    isActive
                      ? 'bg-black/20 text-black/70'
                      : 'bg-white/10 text-zinc-400'
                  )}
                >
                  {option.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
