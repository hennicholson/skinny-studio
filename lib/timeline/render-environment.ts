/**
 * Browser capability + memory-pressure pre-flight checks for the
 * client-side timeline renderer.
 *
 * Estimates are deliberately rough. The goal is to warn the user
 * *before* they spend 60s waiting for an OOM crash, not to predict
 * memory usage with byte-level precision.
 */

import type { Timeline } from './ir'

export interface RenderEnvironment {
  /** WebCodecs is wired up for a future fast-path. Not yet used by renderTimeline. */
  webcodecsSupported: boolean
  /** Approx output size × 3 (input buffers + working set), in MB. */
  estimatedMemoryMB: number
  /** Browser-dependent hard ceiling, in MB. */
  hardMemoryCapMB: number
  /** estimatedMemoryMB > 0.7 × hardMemoryCapMB */
  willLikelyOOM: boolean
  /** Human-readable warnings to surface in the UI. */
  warnings: string[]
}

interface DeviceMemoryNavigator extends Navigator {
  deviceMemory?: number
}

const DEFAULT_BITRATE_BPS = 4_000_000 // 4M, matches RenderOptions default

/** True if the user agent looks like iOS Safari (Safari on iPhone / iPad / iPod). */
function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  // iPadOS 13+ reports as Mac; the simple UA test misses iPad. Good enough for a heuristic.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIOS && isSafari
}

/** True if WebCodecs APIs are present. Reserved for a future fast-path. */
function detectWebCodecs(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined' &&
    typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== 'undefined'
}

/**
 * Estimate the timeline's total duration in seconds.
 *
 * Prefers the explicit `durationSeconds` if non-zero, otherwise derives
 * from clip end-times (timelineStart + (sourceEnd - sourceStart)) across
 * all tracks.
 */
function effectiveDurationSeconds(timeline: Timeline): number {
  if (timeline.durationSeconds && timeline.durationSeconds > 0) {
    return timeline.durationSeconds
  }
  let max = 0
  for (const clip of timeline.clips) {
    const clipLen = Math.max(0, clip.sourceEnd - clip.sourceStart)
    const end = clip.timelineStart + clipLen
    if (end > max) max = end
  }
  return max
}

export function checkRenderEnvironment(timeline: Timeline): RenderEnvironment {
  const warnings: string[] = []
  const webcodecsSupported = detectWebCodecs()
  const ios = isIOSSafari()

  const durationSec = effectiveDurationSeconds(timeline)

  // Output size estimate: bitrate_bps × duration / 8  →  bytes  →  MB
  const outputBytes = (DEFAULT_BITRATE_BPS * durationSec) / 8
  const outputMB = outputBytes / (1024 * 1024)
  // Working set ≈ output × 3 (input buffer + decode/encode working set + output)
  const estimatedMemoryMB = Math.max(50, Math.ceil(outputMB * 3))

  // Hard cap: 25% of deviceMemory (in GiB → MiB), fall back to 1500 MB.
  const nav = typeof navigator !== 'undefined' ? (navigator as DeviceMemoryNavigator) : undefined
  const deviceMemoryGB = nav?.deviceMemory ?? 0
  let hardMemoryCapMB =
    deviceMemoryGB > 0 ? Math.floor(deviceMemoryGB * 1024 * 0.25) : 1500

  // iOS Safari is much more restrictive on wasm heaps + tab memory.
  if (ios) {
    hardMemoryCapMB = Math.min(hardMemoryCapMB, 800)
    warnings.push(
      'iOS Safari has tight memory limits — exports longer than ~60s at 1080p may fail. Try 720p or shorter clips.'
    )
  }

  const willLikelyOOM = estimatedMemoryMB > hardMemoryCapMB * 0.7

  if (willLikelyOOM) {
    warnings.push(
      `This timeline may exceed your browser's memory budget (est. ${estimatedMemoryMB} MB vs ~${hardMemoryCapMB} MB cap). Consider lowering resolution or shortening the timeline.`
    )
  }

  if (timeline.width === 1920 && durationSec > 90) {
    warnings.push(
      'Rendering 1080p video longer than 90 seconds in the browser is slow and memory-heavy. Consider 720p.'
    )
  }

  // Flag clips that fall outside the timeline duration — likely user error,
  // but the renderer will silently include them otherwise.
  for (const clip of timeline.clips) {
    if (clip.sourceEnd <= clip.sourceStart) {
      warnings.push(
        `Clip ${clip.id} has zero or negative duration (sourceEnd <= sourceStart) and will be skipped.`
      )
    }
  }

  // No video tracks → renderer will produce nothing useful.
  const videoTrackIds = new Set(
    timeline.tracks.filter((t) => t.kind === 'video').map((t) => t.id)
  )
  const hasVideo = timeline.clips.some((c) => videoTrackIds.has(c.trackId))
  if (!hasVideo) {
    warnings.push(
      'Timeline has no video clips. Output will be empty.'
    )
  }

  return {
    webcodecsSupported,
    estimatedMemoryMB,
    hardMemoryCapMB,
    willLikelyOOM,
    warnings,
  }
}
