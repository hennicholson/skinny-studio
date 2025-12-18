'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LikeButtonProps {
  isLiked: boolean
  count: number
  onToggle: () => void
  size?: 'sm' | 'md' | 'lg'
  showCount?: boolean
  className?: string
}

export function LikeButton({
  isLiked,
  count,
  onToggle,
  size = 'md',
  showCount = true,
  className,
}: LikeButtonProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  const sizes = {
    sm: { icon: 14, button: 'p-1.5', text: 'text-xs' },
    md: { icon: 18, button: 'p-2', text: 'text-sm' },
    lg: { icon: 22, button: 'p-2.5', text: 'text-base' },
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsAnimating(true)
    onToggle()
    setTimeout(() => setIsAnimating(false), 400)
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'relative flex items-center gap-1.5 rounded-lg backdrop-blur-sm transition-all duration-200',
        sizes[size].button,
        isLiked
          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          : 'bg-black/40 text-white hover:bg-black/60',
        className
      )}
    >
      {/* Heart icon with animation */}
      <motion.div
        animate={isAnimating ? {
          scale: [1, 1.3, 0.9, 1.1, 1],
        } : {}}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <Heart
          size={sizes[size].icon}
          fill={isLiked ? 'currentColor' : 'none'}
          className="transition-colors"
        />
      </motion.div>

      {/* Particle burst on like */}
      <AnimatePresence>
        {isAnimating && isLiked && (
          <>
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full bg-red-400"
                initial={{ scale: 0, x: 0, y: 0 }}
                animate={{
                  scale: [0, 1, 0],
                  x: Math.cos((i * Math.PI * 2) / 6) * 20,
                  y: Math.sin((i * Math.PI * 2) / 6) * 20,
                }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Count with animated number */}
      {showCount && (
        <motion.span
          key={count}
          initial={{ y: isLiked ? -10 : 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(sizes[size].text, 'font-medium tabular-nums')}
        >
          {count}
        </motion.span>
      )}
    </button>
  )
}
