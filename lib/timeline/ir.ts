// Timeline Intermediate Representation.
//
// Merged from the three timeline worktrees:
//   - UI agent: flat clips model + rich helpers (formatTimecode, clipAtTime, …)
//   - Backend agent: narrow renderStatus matching the DB CHECK constraint
//                    + queries-layer helpers (computeTimelineDuration, emptyTimelineDocument)
//   - Render engine agent: ir is just types; renderer.ts imports from here
//
// Pure data; no React, no FFmpeg. Shared between the editor UI, the persistence
// API, and the render engine. Stored 1:1 in Supabase.

// Narrow enum: matches canvas_timelines.render_status CHECK constraint.
export type TimelineRenderStatus = 'idle' | 'rendering' | 'failed'

export type TimelineTrackKind = 'video' | 'audio'

/** A track is a horizontal lane that holds clips. Tracks have a single kind:
 *  'video' (plays + composites) or 'audio' (mixes into output). Multiple tracks
 *  of the same kind are allowed for ordering / layering. */
export interface TimelineTrack {
  id: string
  kind: TimelineTrackKind
  /** User-visible name shown in the rail. */
  label?: string
  /** Lower index = lower in z-order for video tracks. */
  order: number
  /** Track-level mute toggle (mutes all clips). */
  muted?: boolean
  /** Track-level volume (0-1). Multiplied with per-clip volume at render. */
  volume?: number
}

/** Source of media for a clip. Either a video-gen node's output, or a user-
 *  uploaded asset registered in `timeline.uploads`. */
export type TimelineClipSource =
  | { kind: 'canvas-node'; nodeId: string }
  | { kind: 'upload'; uploadId: string }

export interface TimelineClip {
  id: string
  trackId: string
  source: TimelineClipSource
  /** Direct URL to the underlying media (denormalised so playback doesn't
   *  re-look-up the source). */
  sourceUrl: string
  /** In/out trim in seconds, expressed in the SOURCE clip's timebase. */
  sourceStart: number
  sourceEnd: number
  /** Position on the timeline (seconds). The clip occupies
   *  [timelineStart, timelineStart + (sourceEnd - sourceStart)). */
  timelineStart: number
  /** 0..1 (audio only). Optional for video tracks (uses captured audio). */
  volume?: number
  muted?: boolean
}

/** A user-uploaded asset (audio, sometimes video) that lives in storage. */
export interface TimelineUpload {
  id: string
  /** Mime-derived asset kind. Derive from contentType if not set. */
  kind?: 'audio' | 'video'
  url: string
  filename: string
  /** Mime type returned by the upload endpoint (`audio/mpeg`, `video/mp4`, …). */
  contentType?: string
  /** Probed via HTMLAudioElement / HTMLVideoElement after upload. */
  durationSeconds: number
  /** ISO8601 when the user added it. Backend sets this. */
  createdAt?: string
  /** Server-side size in bytes (best effort). */
  sizeBytes?: number
}

export interface Timeline {
  id: string
  canvasId: string
  tracks: TimelineTrack[]
  clips: TimelineClip[]
  uploads: TimelineUpload[]
  fps: number
  width: number
  height: number
  /** Derived (cached): max(clip.timelineStart + (sourceEnd - sourceStart)). */
  durationSeconds: number
  /** Render output. */
  lastRenderedUrl?: string
  lastRenderedAt?: string
  renderStatus?: TimelineRenderStatus
  // Audit
  createdAt: string
  updatedAt: string
  /** Optimistic locking — server bumps on each write. */
  version?: number
}

// ============================================================================
// Helpers (pure)
// ============================================================================

export function newTimelineId(): string {
  return cryptoRandomId('tl')
}

export function newTrackId(): string {
  return cryptoRandomId('tr')
}

export function newClipId(): string {
  return cryptoRandomId('cl')
}

export function newUploadId(): string {
  return cryptoRandomId('up')
}

function cryptoRandomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Length of a clip on the timeline (seconds). */
export function clipTimelineLength(clip: TimelineClip): number {
  return Math.max(0, clip.sourceEnd - clip.sourceStart)
}

/** End time of a clip on the timeline (seconds, exclusive). */
export function clipTimelineEnd(clip: TimelineClip): number {
  return clip.timelineStart + clipTimelineLength(clip)
}

/** Re-derive durationSeconds from clips. */
export function deriveDuration(clips: TimelineClip[]): number {
  if (clips.length === 0) return 0
  return clips.reduce((max, c) => Math.max(max, clipTimelineEnd(c)), 0)
}

/** Find the active clip on a track at time t. Returns the clip whose
 *  [timelineStart, timelineEnd) interval contains t, or null. */
export function clipAtTime(
  clips: TimelineClip[],
  trackId: string,
  t: number,
): TimelineClip | null {
  for (const clip of clips) {
    if (clip.trackId !== trackId) continue
    const end = clipTimelineEnd(clip)
    if (t >= clip.timelineStart && t < end) return clip
  }
  return null
}

/** Format seconds → mm:ss.SSS (or h:mm:ss.SSS for > 1h). */
export function formatTimecode(seconds: number, showMillis = true): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const totalMs = Math.round(seconds * 1000)
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  const sss = String(ms).padStart(3, '0')
  if (hours > 0) {
    const hh = String(hours)
    return showMillis ? `${hh}:${mm}:${ss}.${sss}` : `${hh}:${mm}:${ss}`
  }
  return showMillis ? `${mm}:${ss}.${sss}` : `${mm}:${ss}`
}

/** Build a brand-new empty timeline for a canvas. */
export function blankTimeline(canvasId: string): Timeline {
  const now = new Date().toISOString()
  const videoTrack: TimelineTrack = {
    id: newTrackId(),
    kind: 'video',
    label: 'Video',
    order: 0,
  }
  const audioTrack: TimelineTrack = {
    id: newTrackId(),
    kind: 'audio',
    label: 'Audio',
    order: 1,
  }
  return {
    id: newTimelineId(),
    canvasId,
    tracks: [videoTrack, audioTrack],
    clips: [],
    uploads: [],
    fps: 30,
    width: 1920,
    height: 1080,
    durationSeconds: 0,
    renderStatus: 'idle',
    createdAt: now,
    updatedAt: now,
  }
}

export const DEFAULT_FPS_OPTIONS = [24, 30, 60] as const
export const DEFAULT_RESOLUTION_OPTIONS = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
] as const

// ============================================================================
// Backend-side helper aliases (so lib/supabase/timeline-queries.ts compiles).
// These mirror the names the backend agent wrote against; they delegate to the
// flat-clip helpers above.
// ============================================================================

export const DEFAULT_FPS: number = 30
export const DEFAULT_WIDTH: number = 1920
export const DEFAULT_HEIGHT: number = 1080

/** Backend's name for deriveDuration. The backend computes from a tracks
 *  array historically, but in the merged flat-clips model we accept clips. */
export function computeTimelineDuration(clips: TimelineClip[] | undefined): number {
  if (!clips || clips.length === 0) return 0
  return deriveDuration(clips)
}

/** Backend's bootstrap empty-doc helper. Returns a partial Timeline shape
 *  that the queries layer merges into a brand-new row. */
export function emptyTimelineDocument(canvasId: string): Pick<
  Timeline,
  'tracks' | 'clips' | 'uploads' | 'fps' | 'width' | 'height' | 'durationSeconds' |
  'renderStatus'
> & { canvasId: string } {
  const tl = blankTimeline(canvasId)
  return {
    canvasId,
    tracks: tl.tracks,
    clips: tl.clips,
    uploads: tl.uploads,
    fps: tl.fps,
    width: tl.width,
    height: tl.height,
    durationSeconds: tl.durationSeconds,
    renderStatus: 'idle',
  }
}
