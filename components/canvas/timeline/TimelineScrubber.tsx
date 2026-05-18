'use client'

// Time ruler at the top of the tracks rail. Renders tick marks every second
// and labels every 5 seconds (adjusted based on zoom). Click sets playhead,
// drag scrubs.

import { useCallback, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { pxPerSecond, SCRUBBER_HEIGHT, secondsToPx } from './timeline-constants'
import { formatTimecode } from '@/lib/timeline/ir'

export interface TimelineScrubberProps {
  duration: number
  zoom: number
  playhead: number
  onPlayheadChange(t: number): void
  /** Total scroll-content width (so the ruler always extends past the duration). */
  contentWidthPx: number
}

export function TimelineScrubber({
  duration,
  zoom,
  playhead,
  onPlayheadChange,
  contentWidthPx,
}: TimelineScrubberProps) {
  const ref = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Decide tick spacing based on zoom — keep ticks ~40-100px apart so they
  // don't crowd.
  const tickSpec = useMemo(() => {
    const pxPerSec = pxPerSecond(zoom)
    let majorEverySec = 5
    if (pxPerSec >= 200) majorEverySec = 1
    else if (pxPerSec >= 100) majorEverySec = 2
    else if (pxPerSec >= 50) majorEverySec = 5
    else if (pxPerSec >= 20) majorEverySec = 10
    else majorEverySec = 30
    const minorEverySec = Math.max(1, majorEverySec / 5)
    return { majorEverySec, minorEverySec }
  }, [zoom])

  const totalSeconds = Math.max(
    duration + 5,
    contentWidthPx / pxPerSecond(zoom),
  )

  const ticks = useMemo(() => {
    const result: Array<{ t: number; major: boolean }> = []
    const count = Math.ceil(totalSeconds / tickSpec.minorEverySec) + 1
    for (let i = 0; i < count; i++) {
      const t = i * tickSpec.minorEverySec
      const major = Math.abs(t % tickSpec.majorEverySec) < 0.0001
      result.push({ t, major })
    }
    return result
  }, [totalSeconds, tickSpec.minorEverySec, tickSpec.majorEverySec])

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = Math.max(0, clientX - rect.left + el.scrollLeft)
      const t = x / pxPerSecond(zoom)
      onPlayheadChange(Math.max(0, t))
    },
    [onPlayheadChange, zoom],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      draggingRef.current = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      seekFromPointer(e.clientX)
    },
    [seekFromPointer],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      seekFromPointer(e.clientX)
    },
    [seekFromPointer],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'relative cursor-pointer select-none',
        'border-b border-white/[0.08] bg-white/[0.02]',
      )}
      style={{ height: SCRUBBER_HEIGHT, width: contentWidthPx }}
      role="slider"
      aria-label="Timeline scrubber"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, duration)}
      aria-valuenow={Math.round(playhead * 100) / 100}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {ticks.map(({ t, major }) => (
        <div
          key={t}
          className={cn(
            'absolute top-0 bottom-0 pointer-events-none',
            major ? 'w-px bg-white/30' : 'w-px bg-white/[0.08]',
          )}
          style={{ left: secondsToPx(t, zoom) }}
        >
          {major ? (
            <span className="absolute left-1 top-0.5 text-[10px] font-medium text-white/60 tabular-nums">
              {formatTimecode(t, false)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
