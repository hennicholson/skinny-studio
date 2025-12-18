'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MessageSquare, Images, Users, Settings } from 'lucide-react'
import { Mode } from './mode-switcher'
import { hapticLight } from '@/lib/haptics'

interface BottomNavigationProps {
  mode: Mode
  setMode: (mode: Mode) => void
}

const tabs = [
  { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
  { id: 'library' as const, icon: Images, label: 'Library' },
  { id: 'gallery' as const, icon: Users, label: 'Gallery' },
  { id: 'settings' as const, icon: Settings, label: 'Settings' },
]

const LABEL_WIDTH = 60

export function BottomNavigation({ mode, setMode }: BottomNavigationProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex justify-center pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className={cn(
          "bg-zinc-900/95 backdrop-blur-xl",
          "border border-white/10 rounded-full",
          "flex items-center p-1.5 mb-3 mx-4",
          "shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
          "gap-1",
          "pointer-events-auto"
        )}
      >
        {tabs.map((tab) => {
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
                "flex items-center gap-0 px-3 py-2 rounded-full transition-colors duration-200 relative h-10 min-w-[44px]",
                isActive
                  ? "bg-skinny-yellow/15 text-skinny-yellow gap-2"
                  : "bg-transparent text-zinc-500 hover:bg-white/5",
                "focus:outline-none"
              )}
              aria-label={tab.label}
              type="button"
            >
              <Icon
                size={20}
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
                  {tab.label}
                </span>
              </motion.div>
            </motion.button>
          )
        })}
      </motion.div>
    </nav>
  )
}
