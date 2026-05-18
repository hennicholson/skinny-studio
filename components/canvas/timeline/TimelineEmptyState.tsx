'use client'

// Empty state shown when the timeline has no clips. The library panel on
// the left holds the user's assets — point them there.

import { motion } from 'framer-motion'
import { Film, MoveLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TimelineEmptyStateProps {
  /** Wired to expand the library panel if it's collapsed. */
  onOpenClipPicker(): void
  className?: string
}

export function TimelineEmptyState({ onOpenClipPicker, className }: TimelineEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center px-6 py-12',
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex max-w-md flex-col items-center text-center"
      >
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-skinny-yellow/15 text-skinny-yellow">
          <Film className="h-7 w-7" />
        </span>
        <h2 className="font-display text-2xl uppercase tracking-tight text-white">
          Start your edit
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Drag any clip from the <span className="text-skinny-yellow">Library</span> on the left onto a track below, or double-click it to drop at the end.
        </p>
        <button
          type="button"
          onClick={onOpenClipPicker}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-skinny-yellow px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-skinny-yellow/90 focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black outline-none"
        >
          <MoveLeft className="h-4 w-4" />
          Show library
        </button>
        <p className="mt-4 text-[11px] uppercase tracking-wider text-white/30">
          tip · V select · B razor · C split at playhead · Space play
        </p>
      </motion.div>
    </div>
  )
}
