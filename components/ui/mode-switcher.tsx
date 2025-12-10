'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MessageSquare, Images, Settings } from 'lucide-react'

export type Mode = 'chat' | 'library' | 'settings'

interface ModeSwitcherProps {
  mode: Mode
  setMode: (mode: Mode) => void
}

export function ModeSwitcher({ mode, setMode }: ModeSwitcherProps) {
  const modes = [
    { id: 'chat' as const, icon: MessageSquare, label: 'CHAT' },
    { id: 'library' as const, icon: Images, label: 'LIBRARY' },
    { id: 'settings' as const, icon: Settings, label: 'SETTINGS' },
  ]

  return (
    <div className="relative inline-flex bg-zinc-900 p-1 rounded-full border border-zinc-800">
      {modes.map((item) => {
        const Icon = item.icon
        const isActive = mode === item.id

        return (
          <button
            key={item.id}
            onClick={() => setMode(item.id)}
            className={cn(
              "relative px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-200 flex items-center gap-1.5",
              isActive
                ? "text-black"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {/* Background indicator for active state */}
            {isActive && (
              <motion.div
                layoutId="activeModeIndicator"
                className="absolute inset-0 rounded-full bg-skinny-yellow"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30
                }}
              />
            )}
            <Icon size={14} className="relative z-10 flex-shrink-0" />
            <span className="relative z-10 hidden sm:inline">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
