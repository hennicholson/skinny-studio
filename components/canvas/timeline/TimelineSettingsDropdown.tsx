'use client'

// Tiny "settings" popover: fps + resolution. Lives in the editor header.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_FPS_OPTIONS,
  DEFAULT_RESOLUTION_OPTIONS,
  type Timeline,
} from '@/lib/timeline/ir'

export interface TimelineSettingsDropdownProps {
  timeline: Timeline
  onChange(settings: Partial<Pick<Timeline, 'fps' | 'width' | 'height'>>): void
}

export function TimelineSettingsDropdown({ timeline, onChange }: TimelineSettingsDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Timeline settings"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-md text-white/70 transition-colors',
          'hover:bg-white/[0.06] hover:text-white',
          'focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none',
          open && 'bg-white/[0.06] text-white',
        )}
      >
        <Settings2 className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-white/[0.08] bg-black/95 p-2 shadow-2xl backdrop-blur-xl"
            role="menu"
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/40">Frame rate</div>
            {DEFAULT_FPS_OPTIONS.map((fps) => (
              <button
                type="button"
                key={fps}
                onClick={() => {
                  onChange({ fps })
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-white/80',
                  'hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none',
                )}
              >
                <span>{fps} fps</span>
                {timeline.fps === fps ? <Check className="h-4 w-4 text-skinny-yellow" /> : null}
              </button>
            ))}
            <div className="my-1 h-px bg-white/[0.05]" />
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/40">Resolution</div>
            {DEFAULT_RESOLUTION_OPTIONS.map((res) => {
              const active = timeline.width === res.width && timeline.height === res.height
              return (
                <button
                  type="button"
                  key={res.label}
                  onClick={() => {
                    onChange({ width: res.width, height: res.height })
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-white/80',
                    'hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none',
                  )}
                >
                  <span>
                    {res.label} <span className="text-white/30 text-xs ml-1">{res.width}×{res.height}</span>
                  </span>
                  {active ? <Check className="h-4 w-4 text-skinny-yellow" /> : null}
                </button>
              )
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
