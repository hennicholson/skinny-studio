'use client'

/**
 * Developer-only timeline render harness.
 *
 * Gated behind NODE_ENV === 'development' so it can't ship to prod.
 * Renders a hard-coded sample Timeline through the renderer pipeline
 * and shows the resulting blob in a <video> element.
 *
 * Swap the SAMPLE_URL_A/B constants below to any known-good public
 * MP4 URLs (e.g. files from the project's `generated-videos` bucket)
 * to verify the end-to-end pipeline without needing the editor UI.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { Timeline } from '@/lib/timeline/ir'
import {
  renderTimeline,
  cancelActiveRender,
  checkRenderEnvironment,
  type RenderProgress,
  type RenderEnvironment,
} from '@/lib/timeline/renderer'

// Tiny same-origin MP4 samples (red+440Hz / blue+880Hz, 3s each, 320x240).
// These are generated at dev-setup time and live in /public/timeline-test/,
// so the smoke test does NOT depend on any external CDN's CORS posture.
// Replace with project-owned Supabase Storage URLs once available.
const SAMPLE_URL_A = '/timeline-test/clip-a.mp4'
const SAMPLE_URL_B = '/timeline-test/clip-b.mp4'

const SAMPLE_TIMELINE: Timeline = {
  id: 'sample-timeline',
  canvasId: 'sample-canvas',
  fps: 30,
  width: 720,
  height: 720,
  durationSeconds: 6,
  tracks: [{ id: 'v1', kind: 'video', order: 0 }],
  clips: [
    {
      id: 'clip-a',
      trackId: 'v1',
      source: { kind: 'upload', uploadId: 'sample-a' },
      sourceUrl: SAMPLE_URL_A,
      sourceStart: 0,
      sourceEnd: 3,
      timelineStart: 0,
    },
    {
      id: 'clip-b',
      trackId: 'v1',
      source: { kind: 'upload', uploadId: 'sample-b' },
      sourceUrl: SAMPLE_URL_B,
      sourceStart: 0,
      sourceEnd: 3,
      timelineStart: 3,
    },
  ],
  uploads: [],
  renderStatus: 'idle',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

export default function TimelineTestPage() {
  const [progress, setProgress] = useState<RenderProgress | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const startTimeRef = useRef<number>(0)

  const env: RenderEnvironment = useMemo(
    () => checkRenderEnvironment(SAMPLE_TIMELINE),
    []
  )

  const handleRender = useCallback(async () => {
    if (rendering) return
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setProgress({ phase: 'init', percent: 0 })
    setRendering(true)
    setElapsedMs(null)
    startTimeRef.current = performance.now()
    try {
      const blob = await renderTimeline(SAMPLE_TIMELINE, {
        format: 'mp4',
        onProgress: (p) => setProgress(p),
      })
      const url = URL.createObjectURL(blob)
      setBlobUrl(url)
      setElapsedMs(performance.now() - startTimeRef.current)
    } catch (err) {
      console.error('[timeline-test] render failed:', err)
      setProgress({
        phase: 'error',
        percent: 0,
        message: err instanceof Error ? err.message : String(err),
        error: err instanceof Error ? err : new Error(String(err)),
      })
    } finally {
      setRendering(false)
    }
  }, [rendering])

  const handleCancel = useCallback(() => {
    cancelActiveRender()
  }, [])

  // Production guard. The page is harmless but we want it to look broken in prod.
  if (process.env.NODE_ENV !== 'development') {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <h1 className="text-2xl font-bold">Timeline Test</h1>
        <p className="mt-4 text-white/70">
          This page is only available in development mode.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <h1 className="mb-2 text-2xl font-bold">Timeline Renderer — Smoke Test</h1>
      <p className="mb-6 text-sm text-white/60">
        Renders a 6-second hard-coded sample timeline (two 3s clips) entirely
        client-side via FFmpeg.wasm.
      </p>

      <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-2 text-sm font-semibold text-skinny-yellow">
          Capabilities check
        </h2>
        <ul className="text-xs text-white/80">
          <li>
            WebCodecs supported: <code>{String(env.webcodecsSupported)}</code>
          </li>
          <li>
            Estimated memory: <code>{env.estimatedMemoryMB} MB</code>
          </li>
          <li>
            Hard cap: <code>{env.hardMemoryCapMB} MB</code>
          </li>
          <li>
            Likely OOM: <code>{String(env.willLikelyOOM)}</code>
          </li>
        </ul>
        {env.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-yellow-300">
            {env.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-4 flex gap-3">
        <button
          type="button"
          onClick={handleRender}
          disabled={rendering}
          className="rounded-md bg-skinny-yellow px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {rendering ? 'Rendering…' : 'Render'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={!rendering}
          className="rounded-md border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {progress && (
        <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-white/70">
            <span>
              Phase: <code className="text-skinny-yellow">{progress.phase}</code>
            </span>
            <span>{progress.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-white/10">
            <div
              className="h-full bg-skinny-yellow transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
          {progress.message && (
            <p className="mt-2 text-xs text-white/60">{progress.message}</p>
          )}
          {progress.error && (
            <p className="mt-2 text-xs text-red-400">
              Error: {progress.error.message}
            </p>
          )}
        </section>
      )}

      {blobUrl && (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-2 text-sm font-semibold text-skinny-yellow">
            Rendered output
          </h2>
          {elapsedMs !== null && (
            <p className="mb-2 text-xs text-white/60">
              Render took {(elapsedMs / 1000).toFixed(2)}s.
            </p>
          )}
          <video
            src={blobUrl}
            controls
            className="w-full max-w-2xl rounded-lg border border-white/10"
          />
          <p className="mt-2 text-xs text-white/40 break-all">{blobUrl}</p>
        </section>
      )}
    </main>
  )
}
