/**
 * Client-side Timeline render engine for Skinny Studio.
 *
 * Renders a Timeline IR to an MP4/WebM Blob *entirely in the browser*
 * via FFmpeg.wasm (single-threaded core, self-hosted from /public/ffmpeg/).
 *
 * Public API:
 *   - renderTimeline(timeline, options)  -> Promise<Blob>
 *   - checkRenderEnvironment(timeline)   -> RenderEnvironment   (re-exported)
 *   - cancelActiveRender()               -> boolean
 *   - uploadRender(canvasId, timelineId, blob, signal)
 *
 * The renderer keeps a *singleton* FFmpeg instance warm between renders.
 * Inputs are written to FFmpeg's MEMFS, the filter graph is built from
 * the Timeline, ffmpeg.exec(...) runs the encode, output is read back as
 * a Blob, and the MEMFS is scrubbed (even on failure).
 */

'use client'

import type { FFmpeg as FFmpegType } from '@ffmpeg/ffmpeg'
import type { Timeline, TimelineClip, TimelineTrack } from './ir'

export { checkRenderEnvironment } from './render-environment'
export type { RenderEnvironment } from './render-environment'

// ---------- Public types ----------

export interface RenderProgress {
  phase:
    | 'init'
    | 'fetching'
    | 'transcoding'
    | 'muxing'
    | 'finalizing'
    | 'done'
    | 'error'
  /** 0-100 */
  percent: number
  /** human-friendly status */
  message?: string
  /** populated when phase === 'error' */
  error?: Error
}

export interface RenderOptions {
  onProgress?: (p: RenderProgress) => void
  signal?: AbortSignal
  /** default 'mp4' */
  format?: 'mp4' | 'webm'
  /** e.g. '4M'. default '4M' */
  videoBitrate?: string
  /** e.g. '128k'. default '128k' */
  audioBitrate?: string
}

// ---------- Module-level state ----------

let ffmpegInstance: FFmpegType | null = null
let ffmpegLoadPromise: Promise<FFmpegType> | null = null

/** Tracks the currently-running render so cancelActiveRender() can abort. */
interface ActiveRender {
  abortController: AbortController
  cleanup: () => Promise<void>
}
let activeRender: ActiveRender | null = null

// Self-hosted core paths (copied at build time into public/ffmpeg/).
const CORE_URL = '/ffmpeg/ffmpeg-core.js'
const WASM_URL = '/ffmpeg/ffmpeg-core.wasm'

// ---------- Errors with friendly messages ----------

/**
 * Wraps a low-level error with a UI-friendly message.
 * The original error is preserved on `.cause`.
 */
class FriendlyRenderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'RenderError'
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause
  }
}

// ---------- FFmpeg singleton init ----------

/**
 * Lazy-initialize the FFmpeg singleton. Safe to call multiple times;
 * concurrent calls share the same load promise.
 */
async function getFFmpeg(
  onProgress?: (loadPercent: number) => void
): Promise<FFmpegType> {
  if (ffmpegInstance?.loaded) return ffmpegInstance
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    // Dynamic import so SSR doesn't crash trying to spin up a Worker.
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')

    const ffmpeg = new FFmpeg()

    // Fetch core JS + wasm via blob URLs so we sidestep cross-origin
    // module worker restrictions in production.
    onProgress?.(2)
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(CORE_URL, 'text/javascript'),
      toBlobURL(WASM_URL, 'application/wasm'),
    ])
    onProgress?.(6)

    await ffmpeg.load({ coreURL, wasmURL })
    onProgress?.(10)

    ffmpegInstance = ffmpeg
    return ffmpeg
  })().catch((err) => {
    // Reset so the next call can retry.
    ffmpegLoadPromise = null
    throw new FriendlyRenderError(
      'Failed to initialize the video renderer. Reload the page and try again.',
      err
    )
  })

  return ffmpegLoadPromise
}

// ---------- Filter-graph construction ----------

interface PreparedClip {
  clip: TimelineClip
  /** Index into the ffmpeg input list (-i). */
  inputIndex: number
}

interface FilterGraph {
  filterComplex: string
  /** Output label for the final video stream. May be empty if no video. */
  videoOutLabel: string
  /** Output label for the final audio stream. May be empty if no audio. */
  audioOutLabel: string
}

/**
 * Build a -filter_complex graph from prepared clips.
 *
 * For each video clip:
 *   [i:v]trim=start=a:end=b,setpts=PTS-STARTPTS+T/TB,
 *        scale=W:H:force_original_aspect_ratio=decrease,
 *        pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black,
 *        fps=FPS,setsar=1[vN]
 *
 * Then overlay them onto a generated base canvas of color=black, duration=D:
 *   [base][v0]overlay=shortest=0[tmp0]
 *   [tmp0][v1]overlay=shortest=0[tmp1] ...
 *
 * Using overlay (instead of concat) handles overlapping/non-contiguous clips
 * and "gaps" cleanly — gaps render as black background.
 *
 * For audio clips:
 *   [i:a]atrim=start=a:end=b,asetpts=PTS-STARTPTS,
 *        adelay=Tms|Tms,volume=V[aN]
 * Then amix=n=N:duration=longest:normalize=0[aout]
 */
function buildFilterGraph(
  videoClips: PreparedClip[],
  audioClips: PreparedClip[],
  audioVolumes: Map<string, number>,
  width: number,
  height: number,
  fps: number,
  totalDurationSec: number
): FilterGraph {
  const parts: string[] = []
  let videoOutLabel = ''
  let audioOutLabel = ''

  if (videoClips.length > 0) {
    // Base canvas: solid black at the timeline's resolution + fps for `totalDurationSec`.
    parts.push(
      `color=c=black:s=${width}x${height}:r=${fps}:d=${totalDurationSec.toFixed(3)}[base]`
    )

    for (let i = 0; i < videoClips.length; i++) {
      const { clip, inputIndex } = videoClips[i]
      const trimStart = clip.sourceStart.toFixed(3)
      const trimEnd = clip.sourceEnd.toFixed(3)
      const delaySec = clip.timelineStart.toFixed(3)
      parts.push(
        `[${inputIndex}:v]trim=start=${trimStart}:end=${trimEnd},` +
          `setpts=PTS-STARTPTS+${delaySec}/TB,` +
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
          `fps=${fps},setsar=1[v${i}]`
      )
    }

    // Chain overlays. eof_action=pass keeps the base alive past each clip's end.
    let prev = 'base'
    for (let i = 0; i < videoClips.length; i++) {
      const out = i === videoClips.length - 1 ? 'vout' : `tmp${i}`
      parts.push(`[${prev}][v${i}]overlay=eof_action=pass:shortest=0[${out}]`)
      prev = out
    }
    videoOutLabel = 'vout'
  }

  if (audioClips.length > 0) {
    for (let i = 0; i < audioClips.length; i++) {
      const { clip, inputIndex } = audioClips[i]
      const trimStart = clip.sourceStart.toFixed(3)
      const trimEnd = clip.sourceEnd.toFixed(3)
      const delayMs = Math.round(clip.timelineStart * 1000)
      const volume = audioVolumes.get(clip.id) ?? 1
      parts.push(
        `[${inputIndex}:a]atrim=start=${trimStart}:end=${trimEnd},` +
          `asetpts=PTS-STARTPTS,` +
          `adelay=${delayMs}|${delayMs},` +
          `volume=${volume.toFixed(3)}[a${i}]`
      )
    }
    if (audioClips.length === 1) {
      // Rename for clarity.
      parts.push(`[a0]anull[aout]`)
    } else {
      const inputs = audioClips.map((_, i) => `[a${i}]`).join('')
      parts.push(
        `${inputs}amix=inputs=${audioClips.length}:duration=longest:normalize=0[aout]`
      )
    }
    audioOutLabel = 'aout'
  }

  return {
    filterComplex: parts.join(';'),
    videoOutLabel,
    audioOutLabel,
  }
}

// ---------- Filename helpers ----------

function extFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url, 'http://placeholder.local')
    const path = u.pathname
    const dot = path.lastIndexOf('.')
    if (dot > 0) {
      const ext = path.slice(dot + 1).toLowerCase()
      // Strip query/segment cruft.
      if (/^[a-z0-9]{2,5}$/.test(ext)) return ext
    }
  } catch {
    /* ignore */
  }
  return fallback
}

// ---------- Main: renderTimeline ----------

export async function renderTimeline(
  timeline: Timeline,
  options: RenderOptions = {}
): Promise<Blob> {
  const {
    onProgress,
    signal: externalSignal,
    format = 'mp4',
    videoBitrate = '4M',
    audioBitrate = '128k',
  } = options

  // Compose external + internal AbortControllers so cancelActiveRender()
  // can interrupt independently of the caller's signal.
  const internalAbort = new AbortController()
  const signal = internalAbort.signal
  if (externalSignal) {
    if (externalSignal.aborted) internalAbort.abort(externalSignal.reason)
    else externalSignal.addEventListener('abort', () => internalAbort.abort(externalSignal.reason))
  }

  // Tracks every file we write into MEMFS so we can scrub on the way out.
  const memfsFiles = new Set<string>()
  let outputFile = ''

  // Register cleanup with module-level activeRender slot.
  const cleanup = async () => {
    if (!ffmpegInstance) return
    const names = Array.from(memfsFiles)
    for (const name of names) {
      try {
        await ffmpegInstance.deleteFile(name)
      } catch {
        /* swallow — file may already be gone */
      }
    }
    if (outputFile) {
      try {
        await ffmpegInstance.deleteFile(outputFile)
      } catch {
        /* swallow */
      }
    }
  }

  if (activeRender) {
    // Refuse to start a second render concurrently; FFmpeg singleton isn't reentrant.
    throw new FriendlyRenderError(
      'A render is already in progress. Cancel it before starting a new one.'
    )
  }
  activeRender = { abortController: internalAbort, cleanup }

  const emit = (p: RenderProgress) => {
    try {
      onProgress?.(p)
    } catch {
      /* user callback errors must not crash the renderer */
    }
  }

  const abortGuard = () => {
    if (signal.aborted) {
      throw new DOMException(
        signal.reason instanceof Error ? signal.reason.message : 'aborted',
        'AbortError'
      )
    }
  }

  try {
    emit({ phase: 'init', percent: 0, message: 'Initializing renderer…' })

    const ffmpeg = await getFFmpeg((p) =>
      emit({ phase: 'init', percent: Math.min(10, p), message: 'Loading FFmpeg core…' })
    )
    abortGuard()
    emit({ phase: 'init', percent: 10, message: 'Renderer ready.' })

    // 1. Collect clips, sort by timelineStart for stable input order.
    // Flat-clips model: timeline.clips live at the top level; tracks are pure
    // metadata. Look each clip's track up by trackId.
    const trackById = new Map(timeline.tracks.map((t) => [t.id, t]))
    const videoTracks = timeline.tracks.filter((t) => t.kind === 'video')
    const audioTracks = timeline.tracks.filter((t) => t.kind === 'audio')

    const allClips: { clip: TimelineClip; track: TimelineTrack }[] = []
    for (const c of timeline.clips) {
      if (c.sourceEnd <= c.sourceStart) continue // skip zero-length
      const track = trackById.get(c.trackId)
      if (!track) continue // orphan clip with no track — skip
      allClips.push({ clip: c, track })
    }
    allClips.sort((a, b) => a.clip.timelineStart - b.clip.timelineStart)

    if (allClips.length === 0) {
      throw new FriendlyRenderError(
        'Timeline has no playable clips. Add at least one clip before rendering.'
      )
    }

    // 2. Deduplicate fetches by sourceUrl — same source can be reused.
    const urlToFile = new Map<string, string>()
    const uniqueUrls = Array.from(new Set(allClips.map((c) => c.clip.sourceUrl)))

    emit({
      phase: 'fetching',
      percent: 10,
      message: `Loading ${uniqueUrls.length} source file(s)…`,
    })

    for (let i = 0; i < uniqueUrls.length; i++) {
      abortGuard()
      const url = uniqueUrls[i]
      const ext = extFromUrl(url, 'mp4')
      const filename = `in_${i}.${ext}`
      try {
        const res = await fetch(url, { signal })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`)
        }
        const buf = new Uint8Array(await res.arrayBuffer())
        await ffmpeg.writeFile(filename, buf)
        memfsFiles.add(filename)
        urlToFile.set(url, filename)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err
        throw new FriendlyRenderError(
          `Couldn't load clip ${i + 1} of ${uniqueUrls.length}. Check your connection and try again.`,
          err
        )
      }
      const pct = 10 + ((i + 1) / uniqueUrls.length) * 30 // 10 -> 40
      emit({
        phase: 'fetching',
        percent: Math.floor(pct),
        message: `Loaded ${i + 1} / ${uniqueUrls.length} source file(s).`,
      })
    }

    // 3. Build ffmpeg input list + filter graph.
    // Each clip becomes its own -i entry. (FFmpeg supports reusing the same
    // physical file across -i entries; trim/atrim differ per clip.)
    const args: string[] = []
    const preparedVideo: PreparedClip[] = []
    const preparedAudio: PreparedClip[] = []
    const audioVolumeMap = new Map<string, number>()

    // Determine if we have ANY audio output at all.
    // Per-clip: muted || volume === 0 → skip audio
    // Per-track: track.muted → skip every clip in that track
    // Plus: if track.kind === 'video', the clip's audio stream is also pulled
    //       (so a video track contributes audio unless muted).
    let inputIdx = 0
    for (const { clip, track } of allClips) {
      const filename = urlToFile.get(clip.sourceUrl)
      if (!filename) continue
      args.push('-i', filename)

      // Video tracks contribute video.
      if (track.kind === 'video') {
        preparedVideo.push({ clip, inputIndex: inputIdx })
      }

      // Audio contribution: from audio tracks OR from video clips whose audio
      // isn't muted. Audio tracks default to including audio.
      const trackMuted = track.muted === true
      const clipMuted = clip.muted === true
      const clipVol = clip.volume ?? 1
      const trackVol = track.volume ?? 1
      const effVol = trackVol * clipVol

      if (!trackMuted && !clipMuted && effVol > 0) {
        preparedAudio.push({ clip, inputIndex: inputIdx })
        audioVolumeMap.set(clip.id, effVol)
      }
      inputIdx++
    }

    const totalDuration =
      timeline.durationSeconds && timeline.durationSeconds > 0
        ? timeline.durationSeconds
        : allClips.reduce((max, { clip }) => {
            const end = clip.timelineStart + (clip.sourceEnd - clip.sourceStart)
            return end > max ? end : max
          }, 0)

    if (totalDuration <= 0) {
      throw new FriendlyRenderError(
        'Timeline has zero duration. Add clips before rendering.'
      )
    }

    const fps = timeline.fps
    const { filterComplex, videoOutLabel, audioOutLabel } = buildFilterGraph(
      preparedVideo,
      preparedAudio,
      audioVolumeMap,
      timeline.width,
      timeline.height,
      fps,
      totalDuration
    )

    if (filterComplex) {
      args.push('-filter_complex', filterComplex)
    }
    if (videoOutLabel) {
      args.push('-map', `[${videoOutLabel}]`)
    }
    if (audioOutLabel) {
      args.push('-map', `[${audioOutLabel}]`)
    } else {
      args.push('-an')
    }

    // Codec + container.
    outputFile = `out.${format}`
    if (format === 'mp4') {
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-b:v',
        videoBitrate,
        '-r',
        String(fps)
      )
      if (audioOutLabel) {
        args.push('-c:a', 'aac', '-b:a', audioBitrate, '-ar', '44100')
      }
      args.push('-movflags', '+faststart')
    } else {
      // webm
      args.push(
        '-c:v',
        'libvpx',
        '-b:v',
        videoBitrate,
        '-r',
        String(fps),
        '-pix_fmt',
        'yuv420p'
      )
      if (audioOutLabel) {
        args.push('-c:a', 'libopus', '-b:a', audioBitrate)
      }
    }
    // Force duration to the timeline length so unmatched clip lengths
    // don't produce a longer-than-expected output.
    args.push('-t', totalDuration.toFixed(3))
    args.push(outputFile)

    // 4. Hook progress events.
    emit({
      phase: 'transcoding',
      percent: 40,
      message: 'Transcoding…',
    })
    const onFFProgress = ({ progress }: { progress: number; time: number }) => {
      // ffmpeg progress: 0..1 (sometimes overshoots → clamp).
      const clamped = Math.max(0, Math.min(1, progress))
      const pct = 40 + clamped * 50 // 40 -> 90
      emit({
        phase: 'transcoding',
        percent: Math.floor(pct),
        message: `Transcoding… ${Math.floor(clamped * 100)}%`,
      })
    }
    ffmpeg.on('progress', onFFProgress)

    // Listen for abort to forcibly terminate ffmpeg.
    let aborted = false
    const onAbort = () => {
      aborted = true
      try {
        ffmpeg.terminate()
      } catch {
        /* ignore */
      }
      // Drop our cached instance; next render will reload core.
      ffmpegInstance = null
      ffmpegLoadPromise = null
    }
    signal.addEventListener('abort', onAbort, { once: true })

    let execResult: number
    try {
      execResult = await ffmpeg.exec(args)
    } finally {
      ffmpeg.off('progress', onFFProgress)
      signal.removeEventListener('abort', onAbort)
    }

    if (aborted) {
      throw new DOMException('Render cancelled by user', 'AbortError')
    }
    if (execResult !== 0) {
      // exec returned non-zero; usually means the filter graph or codec failed.
      throw new FriendlyRenderError(
        'FFmpeg failed during transcoding. This usually means a clip uses an unsupported codec. ' +
          'Try re-uploading the clip as MP4/H.264 or MP3/AAC.'
      )
    }

    // 5. Muxing → finalizing.
    emit({
      phase: 'muxing',
      percent: 92,
      message: 'Finalizing video…',
    })
    abortGuard()

    const outputData = (await ffmpeg.readFile(outputFile)) as Uint8Array
    emit({
      phase: 'finalizing',
      percent: 98,
      message: 'Packaging output…',
    })

    if (!outputData || outputData.byteLength === 0) {
      throw new FriendlyRenderError(
        'FFmpeg produced an empty output. This often indicates a memory overflow — try lowering the resolution or shortening clips.'
      )
    }

    const mime = format === 'mp4' ? 'video/mp4' : 'video/webm'
    // outputData is Uint8Array; .buffer is ArrayBufferLike. Force ArrayBuffer.
    const blob = new Blob([outputData.buffer as ArrayBuffer], { type: mime })

    emit({ phase: 'done', percent: 100, message: 'Render complete.' })
    return blob
  } catch (err) {
    const error =
      err instanceof Error
        ? err
        : new FriendlyRenderError('Unknown render failure', err)

    // Heuristic OOM detection: FFmpeg.wasm throws on heap exhaustion with
    // messages mentioning "memory" or "abort" or "out of bounds".
    const msg = (error.message || '').toLowerCase()
    let surfaced: Error = error
    if (
      msg.includes('memory access out of bounds') ||
      msg.includes('out of memory') ||
      (msg.includes('abort') && !error.name.includes('Abort'))
    ) {
      surfaced = new FriendlyRenderError(
        'This timeline is too large for browser-side render. Try lowering resolution or shortening clips.',
        error
      )
    }

    emit({
      phase: 'error',
      percent: 0,
      message: surfaced.message,
      error: surfaced,
    })
    throw surfaced
  } finally {
    await cleanup().catch(() => {
      /* cleanup must not throw */
    })
    if (activeRender?.abortController === internalAbort) {
      activeRender = null
    }
  }
}

// ---------- Cancellation ----------

export function cancelActiveRender(): boolean {
  if (!activeRender) return false
  activeRender.abortController.abort(new DOMException('Render cancelled', 'AbortError'))
  return true
}

// ---------- Upload helper ----------

/**
 * Uploads a rendered Blob to the canvas's timeline render endpoint.
 *
 * Two-phase signed-upload flow (backend's contract):
 *   1. POST {action:'sign', contentType} → returns signedUrl + storagePath
 *   2. PUT blob directly to signedUrl (Supabase Storage)
 *   3. POST {action:'finalize', storagePath} → server verifies + returns public URL
 *
 * Avoids round-tripping the MP4 through Next.js (Edge/Node body-size limits).
 */
export async function uploadRender(
  canvasId: string,
  timelineId: string,
  blob: Blob,
  signal?: AbortSignal
): Promise<{ publicUrl: string }> {
  const contentType = blob.type || 'video/mp4'
  const baseUrl = `/api/canvas/${encodeURIComponent(canvasId)}/timeline/render`

  // Phase 1: ask the server to sign an upload URL.
  const signRes = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sign', contentType }),
    signal,
  })
  if (!signRes.ok) {
    const text = await signRes.text().catch(() => '')
    throw new FriendlyRenderError(
      `Couldn't initiate upload (${signRes.status}). ${text || 'Please try again.'}`
    )
  }
  const signJson = (await signRes.json()) as {
    signedUrl?: string
    storagePath?: string
  }
  if (!signJson.signedUrl || !signJson.storagePath) {
    throw new FriendlyRenderError(
      'Server returned an invalid upload URL. Please try again.'
    )
  }

  // Phase 2: PUT the blob directly to Supabase Storage.
  const putRes = await fetch(signJson.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
    signal,
  })
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '')
    throw new FriendlyRenderError(
      `Upload to storage failed (${putRes.status}). ${text || 'Please try again.'}`
    )
  }

  // Phase 3: tell the server the bytes landed; get back the public URL.
  const finalRes = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'finalize',
      storagePath: signJson.storagePath,
    }),
    signal,
  })
  if (!finalRes.ok) {
    const text = await finalRes.text().catch(() => '')
    throw new FriendlyRenderError(
      `Failed to finalize upload (${finalRes.status}). ${text || 'The video uploaded but the server couldn\'t register it.'}`
    )
  }
  const finalJson = (await finalRes.json()) as { url?: string; publicUrl?: string }
  const publicUrl = finalJson.url ?? finalJson.publicUrl
  if (!publicUrl) {
    throw new FriendlyRenderError(
      'Server confirmed upload but returned no URL. Please refresh and try again.'
    )
  }
  return { publicUrl }
}
