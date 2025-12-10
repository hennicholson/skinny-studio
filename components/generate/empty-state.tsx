'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Camera, User, Mountain, Shapes } from 'lucide-react'

interface EmptyStateProps {
  onQuickAction?: (prompt: string) => void
}

export function EmptyState({ onQuickAction }: EmptyStateProps) {
  const quickActions = [
    {
      label: 'Product',
      description: 'Clean product shots',
      icon: Camera,
      prompt: 'Professional product photography of a sleek minimalist object on clean gradient background, studio lighting'
    },
    {
      label: 'Portrait',
      description: 'Stylized characters',
      icon: User,
      prompt: 'Cinematic portrait of a person with dramatic lighting, detailed features, professional photography'
    },
    {
      label: 'Landscape',
      description: 'Scenic environments',
      icon: Mountain,
      prompt: 'Breathtaking landscape photography, golden hour lighting, majestic mountains and valleys'
    },
    {
      label: 'Abstract',
      description: 'Artistic visuals',
      icon: Shapes,
      prompt: 'Abstract geometric art with bold colors, dynamic shapes, modern digital art style'
    },
  ]

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Animated Sphere Background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: [0.2, 0.4, 0.2],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="w-[500px] h-[500px] sm:w-[600px] sm:h-[600px] rounded-full bg-gradient-to-br from-skinny-yellow/10 via-skinny-green/10 to-lime-500/5 blur-3xl"
        />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 flex flex-col items-center max-w-3xl w-full space-y-10"
      >
        {/* Title */}
        <div className="text-center space-y-4">
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white font-display uppercase tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            SKINNY STUDIO
          </motion.h1>
          <motion.p
            className="text-lg sm:text-xl text-zinc-500 uppercase tracking-widest"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            What will you create?
          </motion.p>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
          {quickActions.map((action, index) => {
            const Icon = action.icon

            return (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                onClick={() => onQuickAction?.(action.prompt)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "group relative overflow-hidden rounded-2xl px-4 py-5 text-left transition-all duration-300",
                  "border-2 border-zinc-800 bg-zinc-900/50",
                  "hover:border-skinny-yellow/50 hover:bg-zinc-900",
                  "hover:shadow-[0_0_30px_rgba(214,252,81,0.1)]"
                )}
              >
                {/* Icon */}
                <div className="mb-3">
                  <Icon
                    size={24}
                    className="text-zinc-500 group-hover:text-skinny-yellow transition-colors duration-300"
                  />
                </div>

                {/* Label */}
                <div className="text-sm font-bold text-white uppercase tracking-wide">
                  {action.label}
                </div>

                {/* Description */}
                <div className="text-xs text-zinc-600 mt-1 group-hover:text-zinc-500 transition-colors">
                  {action.description}
                </div>
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
