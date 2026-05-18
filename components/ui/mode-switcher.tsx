'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MessageSquare, Layers, Images, Users } from 'lucide-react'
import { hapticLight } from '@/lib/haptics'

// Canvas is now a first-class shell mode — it swaps in-place inside the same
// AnimatePresence stack as Chat / Library / Gallery rather than being a
// separate route. The old split-button + portaled popover was a workaround
// for canvas-not-being-embedded and has been removed.
export type Mode = 'chat' | 'canvas' | 'library' | 'gallery' | 'settings'

interface ModeSwitcherProps {
  mode: Mode
  setMode: (mode: Mode) => void
}

const TABS: Array<{
  id: Exclude<Mode, 'settings'>
  icon: typeof MessageSquare
  label: string
  labelWidth: number // slightly wider for longer labels so they don't clip
}> = [
  { id: 'chat',    icon: MessageSquare, label: 'Chat',    labelWidth: 44 },
  { id: 'canvas',  icon: Layers,        label: 'Canvas',  labelWidth: 56 },
  { id: 'library', icon: Images,        label: 'Library', labelWidth: 56 },
  { id: 'gallery', icon: Users,         label: 'Gallery', labelWidth: 56 },
]

export function ModeSwitcher({ mode, setMode }: ModeSwitcherProps) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={cn(
        'relative',
        'bg-zinc-900/95 backdrop-blur-xl',
        'border border-white/10 rounded-full',
        'flex items-center p-1.5',
        'shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
        'gap-1',
      )}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = mode === tab.id

        return (
          <motion.button
            key={tab.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              hapticLight()
              setMode(tab.id)
            }}
            className={cn(
              'flex items-center gap-0 px-3 py-2 rounded-full transition-colors duration-200 relative h-9 min-w-[40px]',
              isActive
                ? 'bg-skinny-yellow/15 text-skinny-yellow gap-2'
                : 'bg-transparent text-zinc-500 hover:bg-white/5',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/40',
            )}
            aria-label={tab.label}
            aria-pressed={isActive}
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
                width: isActive ? `${tab.labelWidth}px` : '0px',
                opacity: isActive ? 1 : 0,
                marginLeft: isActive ? '6px' : '0px',
              }}
              transition={{
                width: { type: 'spring', stiffness: 350, damping: 32 },
                opacity: { duration: 0.19 },
                marginLeft: { duration: 0.19 },
              }}
              className="overflow-hidden flex items-center"
            >
              <span
                className={cn(
                  'font-semibold text-xs whitespace-nowrap select-none transition-opacity duration-200',
                  isActive ? 'text-skinny-yellow' : 'opacity-0',
                )}
              >
                {tab.label}
              </span>
            </motion.div>
          </motion.button>
        )
      })}
    </motion.div>
  )
}
