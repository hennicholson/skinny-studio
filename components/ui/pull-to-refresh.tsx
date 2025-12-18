'use client'

import { useState, useRef, useCallback, ReactNode } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { Loader2, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticMedium } from '@/lib/haptics'

interface PullToRefreshProps {
  children: ReactNode
  onRefresh: () => Promise<void>
  className?: string
  threshold?: number // Pull distance needed to trigger refresh
  disabled?: boolean
}

type RefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing'

export function PullToRefresh({
  children,
  onRefresh,
  className,
  threshold = 80,
  disabled = false,
}: PullToRefreshProps) {
  const [state, setState] = useState<RefreshState>('idle')
  const [pullDistance, setPullDistance] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const indicatorControls = useAnimation()

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return

    const scrollTop = containerRef.current?.scrollTop || 0
    // Only enable pull-to-refresh when at top of scroll
    if (scrollTop === 0) {
      startY.current = e.touches[0].clientY
    }
  }, [disabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || startY.current === null || state === 'refreshing') return

    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current

    // Only activate for downward pull when at top
    if (diff > 0) {
      // Apply resistance to make pull feel natural
      const resistance = 0.4
      const distance = Math.min(diff * resistance, threshold * 1.5)
      setPullDistance(distance)

      if (distance >= threshold && state !== 'ready') {
        setState('ready')
        hapticMedium()
      } else if (distance < threshold && distance > 0 && state !== 'pulling') {
        setState('pulling')
      }

      // Prevent default scroll behavior when pulling
      if (distance > 10) {
        e.preventDefault()
      }
    }
  }, [disabled, state, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (disabled || startY.current === null) {
      startY.current = null
      return
    }

    if (state === 'ready') {
      setState('refreshing')
      setPullDistance(60) // Keep indicator visible during refresh

      try {
        await onRefresh()
      } finally {
        setState('idle')
        setPullDistance(0)
      }
    } else {
      setState('idle')
      setPullDistance(0)
    }

    startY.current = null
  }, [disabled, state, onRefresh])

  const progress = Math.min(pullDistance / threshold, 1)
  const rotation = progress * 180

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-y-auto scroll-touch', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <motion.div
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-10"
        style={{
          top: -50,
          transform: `translateY(${pullDistance}px)`,
        }}
        animate={{
          opacity: pullDistance > 10 ? 1 : 0,
        }}
      >
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            'bg-zinc-900 border border-zinc-700 shadow-lg',
            state === 'ready' && 'border-skinny-yellow bg-zinc-800',
            state === 'refreshing' && 'border-skinny-yellow bg-zinc-800'
          )}
        >
          {state === 'refreshing' ? (
            <Loader2 size={20} className="text-skinny-yellow animate-spin" />
          ) : (
            <ArrowDown
              size={20}
              className={cn(
                'transition-all duration-200',
                state === 'ready' ? 'text-skinny-yellow' : 'text-zinc-400'
              )}
              style={{
                transform: `rotate(${rotation}deg)`,
              }}
            />
          )}
        </div>
      </motion.div>

      {/* Content with transform for smooth pull effect */}
      <motion.div
        style={{
          transform: `translateY(${pullDistance > 0 ? Math.min(pullDistance, 60) : 0}px)`,
        }}
        className="transition-transform duration-75"
      >
        {children}
      </motion.div>
    </div>
  )
}
