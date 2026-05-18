'use client'

// Video preview area. v0 implementation: at playhead time t, find the active
// clip on each VIDEO track and render its <video> element seeked to
// `sourceStart + (t - timelineStart)`. Inactive clips' video elements are
// hidden but kept mounted so seeks remain cheap. Multiple stacked video
// tracks are drawn in z-order; top track wins.

import { memo, useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { clipAtTime, type Timeline } from '@/lib/timeline/ir'

export interface TimelinePreviewProps {
  timeline: Timeline
  playhead: number
  playing: boolean
  /** Optional aspect ratio override; defaults to width/height from timeline. */
  className?: string
}

export const TimelinePreview = memo(function TimelinePreview({
  timeline,
  playhead,
  playing,
  className,
}: TimelinePreviewProps) {
  const videoTracks = useMemo(
    () =>
      timeline.tracks
        .filter((t) => t.kind === 'video')
        .sort((a, b) => a.order - b.order),
    [timeline.tracks],
  )
  const audioTracks = useMemo(
    () => timeline.tracks.filter((t) => t.kind === 'audio'),
    [timeline.tracks],
  )

  // All clips mounted permanently, seeked + shown based on playhead.
  const allClips = timeline.clips

  // Find the topmost active video clip for display.
  const activeVideoClipId = useMemo(() => {
    for (let i = videoTracks.length - 1; i >= 0; i--) {
      const track = videoTracks[i]
      const found = clipAtTime(timeline.clips, track.id, playhead)
      if (found) return found.id
    }
    return null
  }, [videoTracks, timeline.clips, playhead])

  // Active audio clip ids per track for mixing.
  const activeAudioClipIds = useMemo(() => {
    const ids = new Set<string>()
    for (const track of audioTracks) {
      const found = clipAtTime(timeline.clips, track.id, playhead)
      if (found) ids.add(found.id)
    }
    return ids
  }, [audioTracks, timeline.clips, playhead])

  const aspectRatio = `${timeline.width} / ${timeline.height}`

  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center',
        'bg-black/40',
        className,
      )}
    >
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-md bg-black shadow-2xl"
        style={{ aspectRatio }}
      >
        {allClips.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-white/40">
            Drop a clip on the timeline to start
          </div>
        ) : (
          allClips.map((clip) => {
            const track = timeline.tracks.find((t) => t.id === clip.trackId)
            if (!track) return null
            const isVideo = track.kind === 'video'
            const isActiveVideo = isVideo && clip.id === activeVideoClipId
            const isActiveAudio = !isVideo && activeAudioClipIds.has(clip.id)
            return (
              <ClipVideoElement
                key={clip.id}
                clipId={clip.id}
                src={clip.sourceUrl}
                sourceStart={clip.sourceStart}
                timelineStart={clip.timelineStart}
                volume={clip.volume ?? (isVideo ? 1 : 1)}
                muted={clip.muted ?? false}
                isAudio={!isVideo}
                visible={isActiveVideo}
                active={isActiveVideo || isActiveAudio}
                playing={playing}
                playhead={playhead}
              />
            )
          })
        )}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// A single <video> element bound to a clip. Seeks to keep aligned with the
// playhead; plays/pauses with the transport. Hidden when not active.
// ---------------------------------------------------------------------------
function ClipVideoElement({
  clipId,
  src,
  sourceStart,
  timelineStart,
  volume,
  muted,
  isAudio,
  visible,
  active,
  playing,
  playhead,
}: {
  clipId: string
  src: string
  sourceStart: number
  timelineStart: number
  volume: number
  muted: boolean
  isAudio: boolean
  visible: boolean
  active: boolean
  playing: boolean
  playhead: number
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const lastSeekRef = useRef<number>(-1)

  // Compute the source-time at the current playhead.
  const sourceTime = sourceStart + (playhead - timelineStart)

  // Seek when not playing OR drift > 0.2s (keeps audio + video in sync).
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (!active) {
      if (!v.paused) v.pause()
      return
    }
    const drift = Math.abs(v.currentTime - sourceTime)
    if (!playing || drift > 0.2) {
      if (sourceTime >= 0 && sourceTime !== lastSeekRef.current) {
        try {
          v.currentTime = Math.max(0, sourceTime)
          lastSeekRef.current = sourceTime
        } catch {
          /* ignore */
        }
      }
    }
  }, [active, playing, sourceTime])

  // Play/pause to follow transport.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (active && playing) {
      v.play().catch(() => {
        /* autoplay restrictions; user gesture required */
      })
    } else {
      v.pause()
    }
  }, [active, playing])

  // Volume + mute updates.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.volume = Math.max(0, Math.min(1, volume))
    v.muted = muted
  }, [volume, muted])

  return (
    <video
      ref={ref}
      src={src}
      playsInline
      preload="metadata"
      muted={muted}
      data-clip-id={clipId}
      className={cn(
        'absolute inset-0 h-full w-full object-contain',
        visible ? 'opacity-100' : 'opacity-0',
        isAudio && 'sr-only',
      )}
      aria-hidden={!visible}
    />
  )
}
