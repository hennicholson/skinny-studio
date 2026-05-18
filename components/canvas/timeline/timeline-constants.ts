// Shared constants for the timeline editor. Keeping pixel/time conversions
// in one place so the rail, scrubber, clip blocks, and playhead stay in sync.

/** Default pixels-per-second at zoom = 1. */
export const PX_PER_SECOND_BASE = 80

/** Minimum and maximum zoom multipliers. */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 8

/** Pixel height of a single track row. */
export const TRACK_HEIGHT = 72

/** Pixel height of the scrubber/ruler. */
export const SCRUBBER_HEIGHT = 32

/** Pixel width of the track-label gutter on the left. */
export const TRACK_LABEL_WIDTH = 96

/** Pixel snap threshold for drag-snap to playhead / clip edges. */
export const SNAP_THRESHOLD_PX = 8

/** Compute pixels per second at a given zoom. */
export function pxPerSecond(zoom: number): number {
  return PX_PER_SECOND_BASE * zoom
}

/** Convert a duration (seconds) to pixels. */
export function secondsToPx(seconds: number, zoom: number): number {
  return seconds * pxPerSecond(zoom)
}

/** Convert pixel offset to seconds. */
export function pxToSeconds(px: number, zoom: number): number {
  return px / pxPerSecond(zoom)
}
