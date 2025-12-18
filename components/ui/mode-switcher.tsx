'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MessageSquare, Images, Users } from 'lucide-react'
import { hapticLight } from '@/lib/haptics'

// Mode type includes 'settings' but it's only accessible via header icons
export type Mode = 'chat' | 'library' | 'gallery' | 'settings'

interface ModeSwitcherProps {
  mode: Mode
  setMode: (mode: Mode) => void
}

const LABEL_WIDTH = 56

export function ModeSwitcher({ mode, setMode }: ModeSwitcherProps) {
  // Only show these 3 in the tab bar (settings is hidden, accessed via header icon)
  const modes = [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
    { id: 'library' as const, icon: Images, label: 'Library' },
    { id: 'gallery' as const, icon: Users, label: 'Gallery' },
  ]

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn(
        "bg-zinc-900/95 backdrop-blur-xl",
        "border border-white/10 rounded-full",
        "flex items-center p-1.5",
        "shadow-[0_4px_20px_rgba(0,0,0,0.3)]",
        "gap-1"
      )}
    >
      {modes.map((item) => {
        const Icon = item.icon
        const isActive = mode === item.id

        return (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              hapticLight()
              setMode(item.id)
            }}
            className={cn(
              "flex items-center gap-0 px-3 py-2 rounded-full transition-colors duration-200 relative h-9 min-w-[40px]",
              isActive
                ? "bg-skinny-yellow/15 text-skinny-yellow gap-2"
                : "bg-transparent text-zinc-500 hover:bg-white/5",
              "focus:outline-none"
            )}
            aria-label={item.label}
            type="button"
          >
            <Icon
              size={16}
              strokeWidth={2}
              className="transition-colors duration-200 flex-shrink-0"
            />

            <motion.div
              initial={false}
              animate={{
                width: isActive ? `${LABEL_WIDTH}px` : '0px',
                opacity: isActive ? 1 : 0,
                marginLeft: isActive ? '6px' : '0px',
              }}
              transition={{
                width: { type: "spring", stiffness: 350, damping: 32 },
                opacity: { duration: 0.19 },
                marginLeft: { duration: 0.19 },
              }}
              className="overflow-hidden flex items-center"
            >
              <span
                className={cn(
                  "font-semibold text-xs whitespace-nowrap select-none transition-opacity duration-200",
                  isActive ? "text-skinny-yellow" : "opacity-0"
                )}
              >
                {item.label}
              </span>
            </motion.div>
          </motion.button>
        )
      })}
    </motion.div>
  )
}
