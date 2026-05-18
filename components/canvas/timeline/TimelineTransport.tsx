'use client'

// Transport bar: play/pause, current time / total time, frame step, in/out
// keyboard hints. Sits below (or above) the preview.

import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTimecode } from '@/lib/timeline/ir'

export interface TimelineTransportProps {
  playing: boolean
  playhead: number
  duration: number
  fps: number
  onPlayToggle(): void
  onSeek(t: number): void
  onStepFrame(direction: 1 | -1): void
}

export function TimelineTransport({
  playing,
  playhead,
  duration,
  fps,
  onPlayToggle,
  onSeek,
  onStepFrame,
}: TimelineTransportProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] bg-white/[0.02] px-3 py-2 backdrop-blur-md">
      <div className="flex items-center gap-1">
        <TransportButton
          aria-label="Seek to start"
          onClick={() => onSeek(0)}
        >
          <SkipBack className="h-4 w-4" />
        </TransportButton>
        <TransportButton
          aria-label="Step back one frame"
          onClick={() => onStepFrame(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </TransportButton>
        <TransportButton
          primary
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={onPlayToggle}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </TransportButton>
        <TransportButton
          aria-label="Step forward one frame"
          onClick={() => onStepFrame(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </TransportButton>
        <TransportButton
          aria-label="Seek to end"
          onClick={() => onSeek(duration)}
        >
          <SkipForward className="h-4 w-4" />
        </TransportButton>
      </div>

      <div className="flex items-center gap-2 text-sm tabular-nums text-white/80">
        <span className="font-medium text-white">{formatTimecode(playhead)}</span>
        <span className="text-white/30">/</span>
        <span className="text-white/50">{formatTimecode(duration)}</span>
        <span className="ml-2 hidden text-[10px] uppercase tracking-wider text-white/30 sm:inline">
          {fps}fps
        </span>
      </div>

      <div className="hidden items-center gap-3 text-[10px] uppercase tracking-wider text-white/30 md:flex">
        <KbdHint keys={['Space']}>Play</KbdHint>
        <KbdHint keys={['←', '→']}>Frame</KbdHint>
        <KbdHint keys={['[', ']']}>Trim</KbdHint>
      </div>
    </div>
  )
}

function TransportButton({
  children,
  primary,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center rounded-md',
        'transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
        primary
          ? 'bg-skinny-yellow text-black hover:bg-skinny-yellow/90'
          : 'text-white/80 hover:bg-white/[0.06] hover:text-white',
        rest.disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

function KbdHint({ keys, children }: { keys: string[]; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-[10px] font-medium"
        >
          {k}
        </kbd>
      ))}
      <span className="text-white/40">{children}</span>
    </span>
  )
}
