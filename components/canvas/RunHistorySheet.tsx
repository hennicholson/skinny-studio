'use client'

// Right-side slide-in panel listing past runs of a canvas, newest first.
// Each row shows status, started_at, duration, cost, node count. Clicking a
// row expands it to show per-node detail (status + thumbnails for image
// generations).
//
// Mounted from the canvas top bar:
//   const [openHistory, setOpenHistory] = useState(false)
//   ...
//   <RunHistorySheet
//     canvasId={canvas.id}
//     open={openHistory}
//     onClose={() => setOpenHistory(false)}
//   />

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X,
  CheckCircle2,
  CircleAlert,
  Loader2,
  CircleSlash,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
} from 'lucide-react'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'
import {
  CanvasRunDetail,
  CanvasRunNodeDetail,
  CanvasRunSummary,
  getRun,
  listRuns,
} from '@/lib/canvas/run-recorder'

interface RunHistorySheetProps {
  canvasId: string
  open: boolean
  onClose: () => void
}

export function RunHistorySheet({ canvasId, open, onClose }: RunHistorySheetProps) {
  const getHeaders = useWhopHeaders()
  const [runs, setRuns] = useState<CanvasRunSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listRuns(canvasId, getHeaders())
      setRuns(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load runs')
    } finally {
      setLoading(false)
    }
  }, [canvasId, getHeaders])

  useEffect(() => {
    if (!open) return
    refresh()
  }, [open, refresh])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="run-history-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="run-history-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] z-[60] bg-zinc-950 border-l border-white/[0.06] shadow-2xl flex flex-col"
            role="dialog"
            aria-label="Run history"
          >
            <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Run history</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {runs.length === 0
                    ? loading
                      ? 'Loading...'
                      : 'No runs yet'
                    : `${runs.length} run${runs.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X size={14} className="text-zinc-400" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {error && (
                <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}

              {!loading && runs.length === 0 && !error && (
                <EmptyState />
              )}

              <ul className="divide-y divide-white/[0.04]">
                {runs.map((run) => (
                  <RunRow
                    key={run.id}
                    canvasId={canvasId}
                    run={run}
                    expanded={expandedId === run.id}
                    onToggle={() =>
                      setExpandedId((prev) => (prev === run.id ? null : run.id))
                    }
                    getHeaders={getHeaders}
                  />
                ))}
              </ul>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Row + detail
// ---------------------------------------------------------------------------

interface RunRowProps {
  canvasId: string
  run: CanvasRunSummary
  expanded: boolean
  onToggle: () => void
  getHeaders: () => Record<string, string>
}

function RunRow({ canvasId, run, expanded, onToggle, getHeaders }: RunRowProps) {
  const [detail, setDetail] = useState<CanvasRunDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded || detail) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getRun(canvasId, run.id, getHeaders())
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expanded, detail, canvasId, run.id, getHeaders])

  const duration = useMemo(() => formatDuration(run.started_at, run.ended_at), [
    run.started_at,
    run.ended_at,
  ])

  return (
    <li>
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-3 hover:bg-white/[0.03] transition-colors flex items-center gap-3"
      >
        <StatusIcon status={run.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-zinc-200">
            <span className="font-medium">{formatRelative(run.started_at)}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">{duration}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {run.node_count} node{run.node_count === 1 ? '' : 's'}
            <span className="mx-1.5 text-zinc-700">·</span>
            {formatCost(run.actual_cost_cents || run.estimated_cost_cents)}
          </div>
        </div>
        {expanded ? (
          <ChevronDown size={14} className="text-zinc-500" />
        ) : (
          <ChevronRight size={14} className="text-zinc-500" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden bg-black/30"
          >
            <div className="px-5 py-3 space-y-2">
              {loading && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 size={12} className="animate-spin" /> Loading nodes...
                </div>
              )}
              {error && (
                <div className="text-xs text-red-300">{error}</div>
              )}
              {detail && detail.nodes.length === 0 && !loading && (
                <div className="text-xs text-zinc-500">No node telemetry recorded.</div>
              )}
              {detail &&
                detail.nodes.map((node) => (
                  <NodeDetailRow
                    key={node.id}
                    node={node}
                    generations={detail.generations}
                  />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

interface NodeDetailRowProps {
  node: CanvasRunNodeDetail
  generations: CanvasRunDetail['generations']
}

function NodeDetailRow({ node, generations }: NodeDetailRowProps) {
  const gen = node.generation_id ? generations[node.generation_id] : undefined
  const outputs = gen?.output_urls || []
  const thumb = outputs.find((u) => isImageUrl(u))

  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <div className="mt-0.5">
        <StatusIcon status={node.status} small />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-zinc-200 truncate">
          {node.client_node_id}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">
          {formatDuration(node.started_at, node.ended_at)}
          {node.cost_cents > 0 && (
            <>
              <span className="mx-1 text-zinc-700">·</span>
              {formatCost(node.cost_cents)}
            </>
          )}
        </div>
        {node.error && (
          <div className="mt-1 text-[10px] text-red-300 line-clamp-2">
            {node.error}
          </div>
        )}
      </div>
      <div className="w-12 h-12 rounded-md overflow-hidden bg-zinc-900 border border-white/[0.05] flex items-center justify-center shrink-0">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={14} className="text-zinc-700" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
        <ImageIcon size={16} className="text-zinc-500" />
      </div>
      <p className="text-xs text-zinc-400">
        Run this canvas to see history here.
      </p>
    </div>
  )
}

function StatusIcon({ status, small }: { status: string; small?: boolean }) {
  const size = small ? 12 : 14
  if (status === 'running' || status === 'queued') {
    return <Loader2 size={size} className="text-zinc-400 animate-spin" />
  }
  if (status === 'succeeded') {
    return <CheckCircle2 size={size} className="text-emerald-400" />
  }
  if (status === 'failed') {
    return <CircleAlert size={size} className="text-red-400" />
  }
  if (status === 'cancelled' || status === 'skipped') {
    return <CircleSlash size={size} className="text-zinc-500" />
  }
  return <CheckCircle2 size={size} className="text-zinc-500" />
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

function formatDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const ms = Math.max(0, end - start)
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const min = Math.floor(sec / 60)
  const remSec = Math.floor(sec - min * 60)
  return `${min}m ${remSec}s`
}

function formatCost(cents: number): string {
  if (!cents) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

function isImageUrl(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase().split('?')[0]
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.avif')
  )
}
