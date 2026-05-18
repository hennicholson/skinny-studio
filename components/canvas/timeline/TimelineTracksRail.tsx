'use client'

// Horizontal stack of tracks. Each track is a row TRACK_HEIGHT px tall.
// Clips are absolutely positioned inside the row using `left`/`width` derived
// from clip.timelineStart * pxPerSecond and length * pxPerSecond.
//
// Scroll model: this component is the scrollable surface. The scrubber lives
// inside the same scroll container at the top so ruler stays aligned with
// clips. A vertical playhead overlay spans the full height.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Volume2, VolumeX, Video as VideoIcon, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  pxPerSecond,
  secondsToPx,
  TRACK_HEIGHT,
  TRACK_LABEL_WIDTH,
} from './timeline-constants'
import { TimelineScrubber } from './TimelineScrubber'
import { TimelineClipBlock } from './TimelineClipBlock'
import {
  clipTimelineEnd,
  type Timeline,
  type TimelineClip,
  type TimelineTrack,
} from '@/lib/timeline/ir'
import {
  TIMELINE_DRAG_MIME,
  type TimelineDragPayload,
} from './TimelineLibraryPanel'

export interface TimelineTracksRailProps {
  timeline: Timeline
  zoom: number
  playhead: number
  selectedClipId: string | null
  onPlayheadChange(t: number): void
  onClipSelect(clipId: string | null): void
  onClipChange(clipId: string, patch: Partial<TimelineClip>): void
  /** Used to look up canvas-node titles for clip labels. Returned label maps
   *  by clip id. */
  getClipLabel?(clip: TimelineClip): string | undefined
  /** Fired when an asset is dropped from the library. The library's MIME
   *  payload + the drop time (timeline-seconds) + the destination track. */
  onAssetDrop?(payload: TimelineDragPayload, atTime: number, trackId: string): void
}

export function TimelineTracksRail({
  timeline,
  zoom,
  playhead,
  selectedClipId,
  onPlayheadChange,
  onClipSelect,
  onClipChange,
  getClipLabel,
  onAssetDrop,
}: TimelineTracksRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(800)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setScrollLeft(el.scrollLeft)
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => {
      setViewportWidth(el.clientWidth)
    })
    ro.observe(el)
    setViewportWidth(el.clientWidth)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [])

  // Auto-scroll to follow playhead when it leaves viewport.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const playheadPx = secondsToPx(playhead, zoom)
    const margin = 40
    if (playheadPx < el.scrollLeft + margin) {
      el.scrollLeft = Math.max(0, playheadPx - margin)
    } else if (playheadPx > el.scrollLeft + el.clientWidth - margin) {
      el.scrollLeft = playheadPx - el.clientWidth + margin
    }
  }, [playhead, zoom])

  // Snap targets = all other clip edges (start + end).
  const snapTargetsByClip = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const clip of timeline.clips) {
      const others: number[] = []
      for (const other of timeline.clips) {
        if (other.id === clip.id) continue
        others.push(other.timelineStart)
        others.push(clipTimelineEnd(other))
      }
      map.set(clip.id, others)
    }
    return map
  }, [timeline.clips])

  const sortedTracks = useMemo(
    () => [...timeline.tracks].sort((a, b) => a.order - b.order),
    [timeline.tracks],
  )

  const totalDuration = Math.max(
    timeline.durationSeconds,
    viewportWidth / pxPerSecond(zoom),
    10,
  )
  const contentWidthPx = secondsToPx(totalDuration + 5, zoom)
  const playheadPx = secondsToPx(playhead, zoom)

  const onRailClick = useCallback(
    (e: React.MouseEvent) => {
      // Click on empty rail area → deselect + seek.
      if (e.target === e.currentTarget) {
        onClipSelect(null)
      }
    },
    [onClipSelect],
  )

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden border-t border-white/[0.05]">
      {/* Track labels gutter — sticky on the left, doesn't scroll with content */}
      <div
        className="flex-shrink-0 border-r border-white/[0.05] bg-black/40 backdrop-blur-md"
        style={{ width: TRACK_LABEL_WIDTH }}
      >
        {/* Spacer for the scrubber row */}
        <div className="h-8 border-b border-white/[0.08]" />
        {sortedTracks.map((track) => (
          <TrackLabel key={track.id} track={track} />
        ))}
      </div>

      {/* Scrolling content area */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div
          className="relative"
          style={{ width: contentWidthPx, minHeight: '100%' }}
          onClick={onRailClick}
        >
          {/* Scrubber */}
          <TimelineScrubber
            duration={timeline.durationSeconds}
            zoom={zoom}
            playhead={playhead}
            onPlayheadChange={onPlayheadChange}
            contentWidthPx={contentWidthPx}
          />

          {/* Tracks */}
          <div className="relative">
            {sortedTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                clips={timeline.clips.filter((c) => c.trackId === track.id)}
                zoom={zoom}
                playhead={playhead}
                selectedClipId={selectedClipId}
                onClipSelect={onClipSelect}
                onClipChange={onClipChange}
                snapTargetsByClip={snapTargetsByClip}
                getClipLabel={getClipLabel}
                contentWidthPx={contentWidthPx}
                onAssetDrop={onAssetDrop}
              />
            ))}
          </div>

          {/* Playhead line */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-skinny-yellow"
            style={{
              left: playheadPx,
              boxShadow: '0 0 8px rgba(214, 252, 81, 0.8)',
            }}
            aria-hidden="true"
          >
            <span className="absolute -left-[5px] top-0 h-2.5 w-2.5 rotate-45 rounded-sm bg-skinny-yellow" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Track label (gutter)
// ---------------------------------------------------------------------------
function TrackLabel({ track }: { track: TimelineTrack }) {
  const Icon = track.kind === 'audio' ? Music : VideoIcon
  return (
    <div
      className="flex items-center gap-2 border-b border-white/[0.05] px-3 text-[11px] uppercase tracking-wider text-white/60"
      style={{ height: TRACK_HEIGHT }}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate font-medium">
        {track.label || (track.kind === 'audio' ? 'Audio' : 'Video')}
      </span>
      {track.muted ? (
        <VolumeX className="ml-auto h-3.5 w-3.5 text-white/40" />
      ) : (
        <Volume2 className="ml-auto h-3.5 w-3.5 text-white/30" />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One track row (clips overlay)
// ---------------------------------------------------------------------------
function TrackRow({
  track,
  clips,
  zoom,
  playhead,
  selectedClipId,
  onClipSelect,
  onClipChange,
  snapTargetsByClip,
  getClipLabel,
  contentWidthPx,
  onAssetDrop,
}: {
  track: TimelineTrack
  clips: TimelineClip[]
  zoom: number
  playhead: number
  selectedClipId: string | null
  onClipSelect(id: string | null): void
  onClipChange(id: string, patch: Partial<TimelineClip>): void
  snapTargetsByClip: Map<string, number[]>
  getClipLabel?(clip: TimelineClip): string | undefined
  contentWidthPx: number
  onAssetDrop?(payload: TimelineDragPayload, atTime: number, trackId: string): void
}) {
  const [hoverPx, setHoverPx] = useState<number | null>(null)

  // Track-level drag-drop: accept assets whose mediaKind matches the track kind
  // (video → video track, audio → audio track). canvas-node assets always go
  // to a video track. Anything else is rejected.
  const accepts = useCallback(
    (payload: TimelineDragPayload | null): boolean => {
      if (!payload) return false
      if (payload.kind === 'canvas-node') return track.kind === 'video'
      if (payload.kind === 'upload') return payload.mediaKind === track.kind
      return false
    },
    [track.kind],
  )

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only show the indicator if the drag is one of our items.
      const hasOurType = e.dataTransfer.types.includes(TIMELINE_DRAG_MIME)
      if (!hasOurType) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      setHoverPx(x)
    },
    [],
  )

  const onDragLeave = useCallback(() => setHoverPx(null), [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const data = e.dataTransfer.getData(TIMELINE_DRAG_MIME)
      setHoverPx(null)
      if (!data) return
      let payload: TimelineDragPayload | null = null
      try {
        payload = JSON.parse(data) as TimelineDragPayload
      } catch {
        return
      }
      if (!accepts(payload)) return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const t = Math.max(0, x / pxPerSecond(zoom))
      onAssetDrop?.(payload, t, track.id)
    },
    [accepts, zoom, onAssetDrop, track.id],
  )

  return (
    <div
      className={cn(
        'relative border-b border-white/[0.05] transition-colors',
        track.kind === 'audio' ? 'bg-skinny-green/[0.03]' : 'bg-skinny-yellow/[0.02]',
        hoverPx !== null && (track.kind === 'audio' ? 'bg-skinny-green/[0.07]' : 'bg-skinny-yellow/[0.06]'),
      )}
      style={{ height: TRACK_HEIGHT, width: contentWidthPx }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {clips.map((clip) => (
        <TimelineClipBlock
          key={clip.id}
          clip={clip}
          track={track}
          zoom={zoom}
          selected={selectedClipId === clip.id}
          snapTargets={snapTargetsByClip.get(clip.id) ?? []}
          playhead={playhead}
          label={getClipLabel?.(clip)}
          thumbnailUrl={track.kind === 'video' ? clip.sourceUrl : undefined}
          onSelect={onClipSelect}
          onChange={onClipChange}
        />
      ))}

      {/* Drop indicator — vertical line where the new clip will land. */}
      {hoverPx !== null && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1.5 bottom-1.5 w-0.5 rounded',
            track.kind === 'audio' ? 'bg-skinny-green' : 'bg-skinny-yellow',
          )}
          style={{ left: hoverPx, boxShadow: '0 0 8px currentColor' }}
        />
      )}
    </div>
  )
}
