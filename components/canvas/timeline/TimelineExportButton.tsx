'use client'

// "Export Video" button. On click:
//   1) checkRenderEnvironment — if it has errors, block. Warnings prompt.
//   2) renderTimeline with progress callbacks (modal w/ progress + cancel).
//   3) uploadRender, then surface download + "Add to canvas as Output node".

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Plus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  checkRenderEnvironment,
  renderTimeline,
  uploadRender,
  type RenderProgress,
} from '@/lib/timeline/renderer'
import type { Timeline } from '@/lib/timeline/ir'

// The render-engine agent exposes warnings as flat strings on
// RenderEnvironment.warnings + a willLikelyOOM boolean (no .ok / .level shape).
// This thin wrapper adapts to the structured warning shape the UI expected.
type RenderEnvWarning = { level: 'info' | 'warn' | 'error'; message: string }

export interface TimelineExportButtonProps {
  timeline: Timeline
  canvasId: string
  /** Optional handler to add the rendered video back into the canvas as an
   *  Output node — wired in CanvasShell. */
  onAddToCanvas?(publicUrl: string): void
  /** Whop auth headers for the /timeline/render endpoint. Without these the
   *  upload returns 401 and the toast surfaces a generic error. */
  getWhopHeaders?: () => Record<string, string>
}

type ExportState =
  | { kind: 'idle' }
  | { kind: 'warning'; warnings: RenderEnvWarning[] }
  | { kind: 'rendering'; progress: RenderProgress }
  | { kind: 'success'; publicUrl: string }
  | { kind: 'error'; message: string }

export function TimelineExportButton({
  timeline,
  canvasId,
  onAddToCanvas,
  getWhopHeaders,
}: TimelineExportButtonProps) {
  const [state, setState] = useState<ExportState>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const startRender = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setState({
      kind: 'rendering',
      progress: { phase: 'init', percent: 0 },
    })
    try {
      const blob = await renderTimeline(timeline, {
        signal: ac.signal,
        onProgress: (p) => setState({ kind: 'rendering', progress: p }),
      })
      const { publicUrl } = await uploadRender(
        canvasId,
        timeline.id,
        blob,
        ac.signal,
        getWhopHeaders?.() ?? {},
      )
      setState({ kind: 'success', publicUrl })
      toast.success('Render complete')
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setState({ kind: 'idle' })
        return
      }
      console.error('[timeline] export failed', err)
      setState({ kind: 'error', message: err?.message || 'Render failed' })
      toast.error('Render failed')
    }
  }, [canvasId, timeline, getWhopHeaders])

  const onClick = useCallback(() => {
    const env = checkRenderEnvironment(timeline)
    // Adapt flat-string warnings to the structured shape this modal expects.
    // willLikelyOOM is upgraded from a warning to a hard error.
    const structured: RenderEnvWarning[] = env.warnings.map((message) => ({
      level: env.willLikelyOOM && message.includes('memory') ? 'error' : 'warn',
      message,
    }))
    const blocking = structured.find((w) => w.level === 'error')
    if (blocking) {
      toast.error(blocking.message)
      return
    }
    if (structured.length > 0) {
      setState({ kind: 'warning', warnings: structured })
      return
    }
    void startRender()
  }, [startRender, timeline])

  // Cancel on Esc while rendering
  useEffect(() => {
    if (state.kind !== 'rendering') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        abortRef.current?.abort()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.kind])

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={timeline.clips.length === 0}
        aria-label="Export video"
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold',
          'bg-skinny-yellow text-black transition-colors',
          'hover:bg-skinny-yellow/90 active:bg-skinny-yellow/80',
          'focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black outline-none',
          'disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-white/30',
        )}
      >
        <Film className="h-4 w-4" />
        Export
      </button>

      <AnimatePresence>
        {state.kind === 'warning' ? (
          <WarningModal
            warnings={state.warnings}
            onCancel={() => setState({ kind: 'idle' })}
            onConfirm={() => void startRender()}
          />
        ) : null}
        {state.kind === 'rendering' ? (
          <RenderingModal
            progress={state.progress}
            onCancel={() => abortRef.current?.abort()}
          />
        ) : null}
        {state.kind === 'success' ? (
          <SuccessModal
            publicUrl={state.publicUrl}
            onClose={() => setState({ kind: 'idle' })}
            onAddToCanvas={onAddToCanvas}
          />
        ) : null}
        {state.kind === 'error' ? (
          <ErrorModal
            message={state.message}
            onClose={() => setState({ kind: 'idle' })}
            onRetry={() => void startRender()}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function ModalShell({
  children,
  onClose,
  label,
  closeable = true,
}: {
  children: React.ReactNode
  onClose?: () => void
  label: string
  closeable?: boolean
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => closeable && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <motion.div
        className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-black/90 p-6 shadow-2xl backdrop-blur-xl"
        initial={{ scale: 0.95, y: 8, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

function WarningModal({
  warnings,
  onCancel,
  onConfirm,
}: {
  warnings: RenderEnvWarning[]
  onCancel(): void
  onConfirm(): void
}) {
  return (
    <ModalShell label="Render warnings" onClose={onCancel}>
      <header className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/15 text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-white">Heads up</h2>
          <p className="mt-0.5 text-sm text-white/60">
            Some things may slow down or break this render. Continue anyway?
          </p>
        </div>
      </header>
      <ul className="mt-4 space-y-2">
        {warnings.map((w, i) => (
          <li key={i} className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-white/80">
            {w.message}
          </li>
        ))}
      </ul>
      <footer className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-skinny-yellow px-3 py-2 text-sm font-semibold text-black hover:bg-skinny-yellow/90"
        >
          Continue
        </button>
      </footer>
    </ModalShell>
  )
}

function RenderingModal({
  progress,
  onCancel,
}: {
  progress: RenderProgress
  onCancel(): void
}) {
  const pct = Math.round(progress.percent)
  return (
    <ModalShell label="Rendering video" closeable={false}>
      <header className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-skinny-yellow/15 text-skinny-yellow">
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-white">Rendering your video</h2>
          <p className="mt-0.5 text-sm text-white/60 capitalize">
            {progress.message ?? `${progress.phase}…`}
          </p>
        </div>
      </header>
      <div className="mt-5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-skinny-yellow transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-white/50 tabular-nums">
          <span>{pct}%</span>
        </div>
      </div>
      <footer className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80 hover:bg-white/[0.08]"
        >
          <X className="h-4 w-4" />
          Cancel render
        </button>
      </footer>
    </ModalShell>
  )
}

function SuccessModal({
  publicUrl,
  onClose,
  onAddToCanvas,
}: {
  publicUrl: string
  onClose(): void
  onAddToCanvas?(url: string): void
}) {
  return (
    <ModalShell label="Render complete" onClose={onClose}>
      <header className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-skinny-green/15 text-skinny-green">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-white">Render complete</h2>
          <p className="mt-0.5 text-sm text-white/60">Preview, download, or send to your canvas.</p>
        </div>
      </header>
      <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.06] bg-black">
        <video src={publicUrl} controls className="aspect-video w-full" />
      </div>
      <footer className="mt-5 flex items-center justify-end gap-2">
        <a
          href={publicUrl}
          download
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80 hover:bg-white/[0.08]"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
        {onAddToCanvas ? (
          <button
            type="button"
            onClick={() => {
              onAddToCanvas(publicUrl)
              onClose()
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-skinny-green px-3 py-2 text-sm font-semibold text-black hover:bg-skinny-green/90"
          >
            <Plus className="h-4 w-4" />
            Add to canvas
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
        >
          Close
        </button>
      </footer>
    </ModalShell>
  )
}

function ErrorModal({
  message,
  onClose,
  onRetry,
}: {
  message: string
  onClose(): void
  onRetry(): void
}) {
  return (
    <ModalShell label="Render failed" onClose={onClose}>
      <header className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-red-500/15 text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-white">Render failed</h2>
          <p className="mt-0.5 text-sm text-white/60">{message}</p>
        </div>
      </header>
      <footer className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-skinny-yellow px-3 py-2 text-sm font-semibold text-black hover:bg-skinny-yellow/90"
        >
          Retry
        </button>
      </footer>
    </ModalShell>
  )
}
