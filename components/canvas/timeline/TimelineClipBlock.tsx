'use client'

// One clip rectangle on a track. Three drag affordances:
//   - body drag → moves `timelineStart`
//   - left handle → adjusts `sourceStart` (in-point) while keeping the
//     timeline anchor of the right edge constant
//   - right handle → adjusts `sourceEnd` (out-point) while keeping
//     `timelineStart` constant
//
// Snap behavior: when moving, snap the leading or trailing edge to playhead
// or to neighboring clip edges if within SNAP_THRESHOLD_PX.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Video, Music, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineClip, TimelineTrack } from '@/lib/timeline/ir'
import {
  pxPerSecond,
  pxToSeconds,
  secondsToPx,
  SNAP_THRESHOLD_PX,
} from './timeline-constants'
import { clipTimelineLength } from '@/lib/timeline/ir'

export interface TimelineClipBlockProps {
  clip: TimelineClip
  track: TimelineTrack
  zoom: number
  selected: boolean
  /** Other clip edges (in seconds) to snap against — excludes this clip. */
  snapTargets: number[]
  /** Playhead (seconds) — also a snap target while dragging. */
  playhead: number
  /** Label fallback (e.g. node title) when the clip source has no filename. */
  label?: string
  /** First-frame thumbnail URL — usually `sourceUrl` for a <video> poster. */
  thumbnailUrl?: string
  onSelect(clipId: string): void
  onChange(clipId: string, patch: Partial<TimelineClip>): void
}

type DragMode = null | 'move' | 'left' | 'right'

export const TimelineClipBlock = memo(function TimelineClipBlock({
  clip,
  track,
  zoom,
  selected,
  snapTargets,
  playhead,
  label,
  thumbnailUrl,
  onSelect,
  onChange,
}: TimelineClipBlockProps) {
  const length = clipTimelineLength(clip)
  const widthPx = secondsToPx(length, zoom)
  const leftPx = secondsToPx(clip.timelineStart, zoom)

  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startTimelineStart: number
    startSourceStart: number
    startSourceEnd: number
  } | null>(null)

  const [dragMode, setDragMode] = useState<DragMode>(null)

  // Snap helper — try to align an edge time (in seconds) to nearby targets.
  // `edgeOptions` is the list of timeline-second values that should be tested
  // for snapping. We snap whichever option lands closest to a target.
  const snapDelta = useCallback(
    (deltaSeconds: number, edgeOptions: number[]): number => {
      const pxPerSec = pxPerSecond(zoom)
      const thresholdSec = SNAP_THRESHOLD_PX / pxPerSec
      const targets = [playhead, ...snapTargets]
      let bestDelta = deltaSeconds
      let bestDist = Infinity
      for (const edgeOption of edgeOptions) {
        const edgeAfter = edgeOption + deltaSeconds
        for (const t of targets) {
          const dist = Math.abs(edgeAfter - t)
          if (dist < thresholdSec && dist < bestDist) {
            bestDist = dist
            bestDelta = t - edgeOption
          }
        }
      }
      return bestDelta
    },
    [zoom, snapTargets, playhead],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent, mode: 'move' | 'left' | 'right') => {
      e.preventDefault()
      e.stopPropagation()
      onSelect(clip.id)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        mode,
        startX: e.clientX,
        startTimelineStart: clip.timelineStart,
        startSourceStart: clip.sourceStart,
        startSourceEnd: clip.sourceEnd,
      }
      setDragMode(mode)
    },
    [clip.id, clip.timelineStart, clip.sourceStart, clip.sourceEnd, onSelect],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dxPx = e.clientX - drag.startX
      const dt = pxToSeconds(dxPx, zoom)

      if (drag.mode === 'move') {
        const newStart = Math.max(0, drag.startTimelineStart + dt)
        const desired = newStart - drag.startTimelineStart
        const edge0 = drag.startTimelineStart
        const edge1 = drag.startTimelineStart + (drag.startSourceEnd - drag.startSourceStart)
        const snapped = snapDelta(desired, [edge0, edge1])
        const finalStart = Math.max(0, drag.startTimelineStart + snapped)
        onChange(clip.id, { timelineStart: finalStart })
        return
      }
      if (drag.mode === 'left') {
        // Move the left trim point. SourceStart shifts by dt clamped so
        // sourceStart stays in [0, sourceEnd - 0.05]. The timeline-start
        // shifts in lockstep so the right edge stays anchored.
        let newSourceStart = Math.max(
          0,
          Math.min(drag.startSourceEnd - 0.05, drag.startSourceStart + dt),
        )
        const newTimelineStart = drag.startTimelineStart + (newSourceStart - drag.startSourceStart)
        // Snap leading edge to targets.
        const edge = newTimelineStart
        const snapped = snapDelta(0, [edge])
        const snappedSourceStart = newSourceStart + snapped
        const snappedTimelineStart = newTimelineStart + snapped
        if (snappedSourceStart >= 0 && snappedSourceStart < drag.startSourceEnd) {
          newSourceStart = snappedSourceStart
        }
        onChange(clip.id, {
          sourceStart: newSourceStart,
          timelineStart: Math.max(0, snappedTimelineStart),
        })
        return
      }
      if (drag.mode === 'right') {
        const newSourceEnd = Math.max(drag.startSourceStart + 0.05, drag.startSourceEnd + dt)
        // Snap trailing edge.
        const trailingEdge = drag.startTimelineStart + (newSourceEnd - drag.startSourceStart)
        const snapped = snapDelta(0, [trailingEdge])
        onChange(clip.id, {
          sourceEnd: newSourceEnd + snapped,
        })
        return
      }
    },
    [clip.id, onChange, snapDelta, zoom],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      dragRef.current = null
      setDragMode(null)
    }
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Arrow keys (no modifier) when the block is focused = nudge by 1 frame
      // (assume 30fps fallback — the parent rail re-renders with current fps).
      if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        onChange(clip.id, {
          timelineStart: Math.max(0, clip.timelineStart - (e.shiftKey ? 1 : 1 / 30)),
        })
      } else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        onChange(clip.id, {
          timelineStart: clip.timelineStart + (e.shiftKey ? 1 : 1 / 30),
        })
      }
    },
    [clip.id, clip.timelineStart, onChange],
  )

  const isAudio = track.kind === 'audio'

  const displayLabel = useMemo(() => {
    if (label) return label
    if (clip.source.kind === 'upload') return 'Upload'
    return 'Canvas clip'
  }, [label, clip.source.kind])

  return (
    <motion.div
      className={cn(
        'group/clip absolute top-1.5 bottom-1.5 rounded-lg cursor-grab active:cursor-grabbing',
        'border transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
        isAudio
          ? 'bg-skinny-green/15 border-skinny-green/30 hover:border-skinny-green/60'
          : 'bg-skinny-yellow/15 border-skinny-yellow/30 hover:border-skinny-yellow/60',
        selected &&
          (isAudio
            ? 'ring-2 ring-skinny-green border-skinny-green/80'
            : 'ring-2 ring-skinny-yellow border-skinny-yellow/80'),
        dragMode && 'opacity-90',
      )}
      style={{
        left: leftPx,
        width: Math.max(widthPx, 8),
      }}
      role="button"
      tabIndex={0}
      aria-label={`${isAudio ? 'Audio' : 'Video'} clip ${displayLabel}, ${length.toFixed(2)} seconds`}
      aria-selected={selected}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(clip.id)
      }}
      initial={false}
      animate={{
        scale: selected ? 1 : 1,
        opacity: 1,
      }}
      transition={{ duration: 0.12 }}
    >
      {/* Content */}
      <div className="flex h-full items-stretch gap-1 overflow-hidden px-1 py-0.5">
        {/* Thumbnail (video only) */}
        {!isAudio && thumbnailUrl ? (
          // Use a <video> with no controls as a frame poster. We seek to a
          // small time so we get past the black first frame on some encoders.
          <ClipThumbnail url={thumbnailUrl} seekTo={clip.sourceStart} />
        ) : null}
        <div className="flex flex-1 flex-col justify-between min-w-0 px-1">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/80">
            {isAudio ? <Music className="h-3 w-3" /> : <Video className="h-3 w-3" />}
            <span className="truncate font-medium">{displayLabel}</span>
          </div>
          <div className="text-[10px] text-white/60 tabular-nums">
            {length.toFixed(2)}s
          </div>
        </div>
      </div>

      {/* Left trim handle */}
      <button
        type="button"
        aria-label="Trim in point"
        className={cn(
          'absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize',
          'flex items-center justify-center',
          'opacity-0 group-hover/clip:opacity-100 focus-visible:opacity-100',
          selected && 'opacity-100',
          'transition-opacity',
        )}
        onPointerDown={(e) => onPointerDown(e, 'left')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            'block h-6 w-[3px] rounded-full',
            isAudio ? 'bg-skinny-green' : 'bg-skinny-yellow',
          )}
        />
      </button>
      {/* Right trim handle */}
      <button
        type="button"
        aria-label="Trim out point"
        className={cn(
          'absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize',
          'flex items-center justify-center',
          'opacity-0 group-hover/clip:opacity-100 focus-visible:opacity-100',
          selected && 'opacity-100',
          'transition-opacity',
        )}
        onPointerDown={(e) => onPointerDown(e, 'right')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            'block h-6 w-[3px] rounded-full',
            isAudio ? 'bg-skinny-green' : 'bg-skinny-yellow',
          )}
        />
      </button>
    </motion.div>
  )
})

// ---------------------------------------------------------------------------
// Thumbnail — lazy <video>, seeked to sourceStart, used as a poster.
// ---------------------------------------------------------------------------
function ClipThumbnail({ url, seekTo }: { url: string; seekTo: number }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const onLoaded = () => {
      try {
        v.currentTime = Math.min(seekTo, Math.max(0, (v.duration || 0) - 0.05))
      } catch {
        /* ignore */
      }
    }
    v.addEventListener('loadedmetadata', onLoaded, { once: true })
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [seekTo, url])
  return (
    <video
      ref={ref}
      src={url}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      className="aspect-video h-full w-auto rounded-sm bg-black object-cover pointer-events-none select-none"
    />
  )
}
