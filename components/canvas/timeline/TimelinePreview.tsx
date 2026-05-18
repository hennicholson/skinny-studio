'use client'

// Single-element video preview. At every playhead position we resolve which
// clip is active on the topmost video track, then point ONE <video> element
// at that clip's sourceUrl with currentTime = sourceStart + (playhead - timelineStart).
//
// Why one element instead of N stacked ones:
//   - preload="metadata" on a stack of videos means the browser fetches just
//     metadata for each — when the active one tries to .currentTime = t the
//     frame buffer isn't populated yet and nothing renders.
//   - Audio clips are mixed via separate <audio> elements per active audio
//     clip (cheap, no display, just play/pause + seek).
//   - First-frame display is forced via load() + waiting on `loadeddata`
//     before seeking — guarantees the frame paints.

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { clipAtTime, type Timeline, type TimelineClip } from '@/lib/timeline/ir'

export interface TimelinePreviewProps {
  timeline: Timeline
  playhead: number
  playing: boolean
  className?: string
}

export function TimelinePreview({
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

  // Topmost active video clip at the current playhead.
  const activeVideo = useMemo<TimelineClip | null>(() => {
    for (let i = videoTracks.length - 1; i >= 0; i--) {
      const track = videoTracks[i]
      const found = clipAtTime(timeline.clips, track.id, playhead)
      if (found) return found
    }
    return null
  }, [videoTracks, timeline.clips, playhead])

  // All active audio clips (one per track at most).
  const activeAudio = useMemo<TimelineClip[]>(() => {
    const out: TimelineClip[] = []
    for (const track of audioTracks) {
      if (track.muted) continue
      const found = clipAtTime(timeline.clips, track.id, playhead)
      if (found && !found.muted) out.push(found)
    }
    return out
  }, [audioTracks, timeline.clips, playhead])

  return (
    <div
      className={cn(
        // `min-h-0` is critical — without it the flex item can't shrink and
        // the preview overflows its parent. The video element inside uses
        // `object-contain` + max-h/max-w so it letterboxes to the timeline's
        // intended aspect ratio without needing a wrapper that pre-computes
        // dimensions. (The previous impl wrapped in a div with aspectRatio
        // but no explicit size — CSS gave it 0×0, audio played invisibly.)
        'relative flex h-full w-full min-h-0 items-center justify-center bg-black/40',
        className,
      )}
      data-timeline-w={timeline.width}
      data-timeline-h={timeline.height}
    >
      {timeline.clips.length === 0 ? (
        <div className="px-4 text-center text-sm text-white/40">
          Drop a clip on the timeline to start
        </div>
      ) : activeVideo ? (
        <VideoSurface clip={activeVideo} playhead={playhead} playing={playing} />
      ) : (
        // Gap on the video track — show "no source" instead of an empty box
        // so users understand why the preview is dark.
        <div className="text-xs text-white/30">No video at this point</div>
      )}
      {/* Audio mixers — separate hidden elements per active audio clip. */}
      {activeAudio.map((clip) => (
        <AudioSurface key={clip.id} clip={clip} playhead={playhead} playing={playing} />
      ))}
    </div>
  )
}

/* ─────────────────────── Single-element video surface ─────────────────── */

function VideoSurface({
  clip,
  playhead,
  playing,
}: {
  clip: TimelineClip
  playhead: number
  playing: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  // The "intended" source time, recomputed every render.
  const sourceTime = Math.max(0, clip.sourceStart + (playhead - clip.timelineStart))
  // Track whether the current <video>'s src + initial seek have settled so
  // we know it's safe to seek on later playhead moves (Safari throws when
  // you set currentTime before loadeddata fires).
  const [ready, setReady] = useState(false)
  // Per-src lifecycle: when the clip changes, reset readiness + force load.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    setReady(false)
    v.preload = 'auto'
    v.playsInline = true
    v.muted = clip.muted ?? false
    v.volume = Math.max(0, Math.min(1, clip.volume ?? 1))
    const onLoaded = () => {
      try {
        v.currentTime = sourceTime
      } catch {
        /* ignore — some browsers throw on tiny invalid seeks */
      }
      setReady(true)
    }
    v.addEventListener('loadeddata', onLoaded)
    // Calling load() explicitly nudges Safari to actually fetch a video
    // segment instead of stopping at metadata — without this, the very
    // first frame never paints until the user hits play.
    v.load()
    return () => {
      v.removeEventListener('loadeddata', onLoaded)
    }
    // Re-run when the SRC changes (different clip selected at playhead).
    // sourceTime intentionally not in deps — the seek effect below handles it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.sourceUrl])

  // Seek when the playhead diverges from where the video actually is.
  useEffect(() => {
    const v = ref.current
    if (!v || !ready) return
    const drift = Math.abs(v.currentTime - sourceTime)
    // Always seek when paused (scrub feel); when playing only correct large drift
    // (avoid micro-stutter from constant seeks).
    if (!playing || drift > 0.25) {
      try {
        v.currentTime = sourceTime
      } catch {
        /* ignore */
      }
    }
  }, [sourceTime, playing, ready])

  // Follow the transport.
  useEffect(() => {
    const v = ref.current
    if (!v || !ready) return
    if (playing) {
      v.play().catch(() => {
        /* autoplay blocked — user gesture required */
      })
    } else {
      v.pause()
    }
  }, [playing, ready])

  return (
    <video
      ref={ref}
      src={clip.sourceUrl}
      playsInline
      preload="auto"
      // max-h/max-w + object-contain letterboxes the video to fit the
      // available preview area while preserving its native aspect ratio.
      // (Previously the video used absolute inset-0 inside a 0×0 wrapper,
      // which is why audio played but you saw nothing.)
      className="max-h-full max-w-full rounded-md bg-black object-contain shadow-2xl"
    />
  )
}

/* ─────────────────────── Audio mixer (hidden element) ─────────────────── */

function AudioSurface({
  clip,
  playhead,
  playing,
}: {
  clip: TimelineClip
  playhead: number
  playing: boolean
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const sourceTime = Math.max(0, clip.sourceStart + (playhead - clip.timelineStart))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const a = ref.current
    if (!a) return
    setReady(false)
    a.preload = 'auto'
    a.muted = clip.muted ?? false
    a.volume = Math.max(0, Math.min(1, clip.volume ?? 1))
    const onLoaded = () => {
      try {
        a.currentTime = sourceTime
      } catch {
        /* ignore */
      }
      setReady(true)
    }
    a.addEventListener('loadeddata', onLoaded)
    a.load()
    return () => {
      a.removeEventListener('loadeddata', onLoaded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.sourceUrl])

  useEffect(() => {
    const a = ref.current
    if (!a || !ready) return
    const drift = Math.abs(a.currentTime - sourceTime)
    if (!playing || drift > 0.25) {
      try {
        a.currentTime = sourceTime
      } catch {
        /* ignore */
      }
    }
  }, [sourceTime, playing, ready])

  useEffect(() => {
    const a = ref.current
    if (!a || !ready) return
    if (playing) {
      a.play().catch(() => {
        /* autoplay blocked */
      })
    } else {
      a.pause()
    }
  }, [playing, ready])

  return <audio ref={ref} src={clip.sourceUrl} preload="auto" className="sr-only" />
}
