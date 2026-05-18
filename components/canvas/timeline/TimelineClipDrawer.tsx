'use client'

// Properties panel for the selected clip. Mobile = bottom sheet, desktop =
// right-side panel. Lets you trim numerically, set volume / mute, delete.

import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, X, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  clipTimelineLength,
  formatTimecode,
  type TimelineClip,
  type TimelineTrack,
} from '@/lib/timeline/ir'

export interface TimelineClipDrawerProps {
  clip: TimelineClip | null
  track: TimelineTrack | undefined
  onChange(patch: Partial<TimelineClip>): void
  onDelete(): void
  onClose(): void
  /** Inline (desktop side panel) or overlay (mobile sheet). */
  variant?: 'side' | 'sheet'
}

export function TimelineClipDrawer({
  clip,
  track,
  onChange,
  onDelete,
  onClose,
  variant = 'side',
}: TimelineClipDrawerProps) {
  if (!clip || !track) return null
  if (variant === 'sheet') {
    return (
      <AnimatePresence>
        <motion.div
          key={clip.id}
          className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-white/[0.08] bg-black/90 p-4 backdrop-blur-xl shadow-2xl"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 350, damping: 32 }}
          role="dialog"
          aria-label="Clip properties"
        >
          <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15" />
          <DrawerBody clip={clip} track={track} onChange={onChange} onDelete={onDelete} onClose={onClose} />
        </motion.div>
      </AnimatePresence>
    )
  }
  return (
    <aside
      className="flex h-full w-72 flex-col border-l border-white/[0.05] bg-white/[0.02] backdrop-blur-md"
      role="region"
      aria-label="Clip properties"
    >
      <DrawerBody clip={clip} track={track} onChange={onChange} onDelete={onDelete} onClose={onClose} />
    </aside>
  )
}

function DrawerBody({
  clip,
  track,
  onChange,
  onDelete,
  onClose,
}: {
  clip: TimelineClip
  track: TimelineTrack
  onChange(patch: Partial<TimelineClip>): void
  onDelete(): void
  onClose(): void
}) {
  const length = clipTimelineLength(clip)
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Clip properties</h2>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/40">
            {track.kind === 'audio' ? 'Audio' : 'Video'} · {length.toFixed(2)}s
          </p>
        </div>
        <button
          type="button"
          aria-label="Close clip properties"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-col gap-3">
        <NumberField
          label="Timeline start"
          value={clip.timelineStart}
          min={0}
          step={1 / 30}
          onChange={(v) => onChange({ timelineStart: Math.max(0, v) })}
          formatter={formatTimecode}
        />
        <NumberField
          label="In-point (source)"
          value={clip.sourceStart}
          min={0}
          step={1 / 30}
          onChange={(v) => {
            const next = Math.max(0, Math.min(clip.sourceEnd - 0.05, v))
            onChange({ sourceStart: next })
          }}
          formatter={formatTimecode}
        />
        <NumberField
          label="Out-point (source)"
          value={clip.sourceEnd}
          min={clip.sourceStart + 0.05}
          step={1 / 30}
          onChange={(v) => onChange({ sourceEnd: Math.max(clip.sourceStart + 0.05, v) })}
          formatter={formatTimecode}
        />

        {/* Volume + mute */}
        <div className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between text-xs text-white/70">
            <span>Volume</span>
            <button
              type="button"
              aria-label={clip.muted ? 'Unmute clip' : 'Mute clip'}
              onClick={() => onChange({ muted: !clip.muted })}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white',
                clip.muted && 'text-skinny-yellow',
              )}
            >
              {clip.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={clip.volume ?? 1}
            onChange={(e) => onChange({ volume: parseFloat(e.target.value) })}
            className="w-full accent-skinny-yellow"
            aria-label="Clip volume"
          />
          <div className="text-right text-[10px] tabular-nums text-white/50">
            {Math.round((clip.volume ?? 1) * 100)}%
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/15 focus-visible:ring-2 focus-visible:ring-red-400/60"
        >
          <Trash2 className="h-4 w-4" />
          Delete clip
        </button>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  step,
  formatter,
  onChange,
}: {
  label: string
  value: number
  min?: number
  step?: number
  formatter?(v: number): string
  onChange(v: number): void
}) {
  const [text, setText] = useState(formatter ? formatter(value) : String(value))
  useEffect(() => {
    setText(formatter ? formatter(value) : String(value))
  }, [value, formatter])

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-white/40">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          step={step}
          value={Number(value.toFixed(3))}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v)) onChange(v)
          }}
          className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-sm text-white tabular-nums outline-none focus:border-skinny-yellow/50 focus:ring-1 focus:ring-skinny-yellow/30"
        />
        <span className="text-[11px] tabular-nums text-white/30">{text}</span>
      </div>
    </label>
  )
}
