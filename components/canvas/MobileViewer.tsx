'use client'

// Mobile + tablet canvas view.
//
// Editing a node graph at 390px is genuinely hard, so this view leans into
// "view + lightly edit + run" instead of trying to be a node editor:
//
//   - Phone (<640px): single-column stacked node cards, edit-on-tap via
//     MobileNodeSheet (bottom-sheet)
//   - Tablet (640..1023): two-column grid so an iPad isn't wasted screen
//   - Desktop (>=1024): not used — CanvasShell takes over
//
// Cards show: title, status pill, model name, prompt preview (for text
// nodes), cost, and output previews. Tapping any card opens the editor
// sheet. The toolbar at the top is sticky, uses safe-area insets, and
// shows the Skinny logo + run/stop.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Play,
  Square,
  Image as ImageIcon,
  Film,
  Sparkles,
  CircleDot,
  Layers,
  FileText,
  Box,
  AlertCircle,
  Pencil,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Canvas, CanvasNode, NODE_TYPES, NodeStatus, NodeType } from '@/lib/canvas/ir'
import { runCanvas, summarizeStatuses } from '@/lib/canvas/executor'
import { toast } from 'sonner'
import { useBreakpoint } from '@/lib/canvas/breakpoints'
import { MobileNodeSheet } from './MobileNodeSheet'
import { StudioModelLite } from './types'

// LocalStorage key for the "view-only summary" tip dismissal. We dismiss
// permanently after the first edit so returning users aren't nagged.
const TIP_DISMISSED_KEY = 'skinny:mobile-viewer:tip-dismissed'

interface MobileViewerProps {
  initial: Canvas
  getWhopHeaders: () => Record<string, string>
  // Optional model list — when present, the edit sheet renders schema-driven
  // param fields. Passing this through is optional (caller may not have it).
  models?: StudioModelLite[]
}

export function MobileViewer({ initial, getWhopHeaders, models }: MobileViewerProps) {
  const bp = useBreakpoint()
  const [canvas, setCanvas] = useState<Canvas>(initial)
  const [running, setRunning] = useState(false)
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [tipDismissed, setTipDismissed] = useState(false)

  // Read tip-dismissal once on mount (avoid SSR access to localStorage).
  useEffect(() => {
    try {
      setTipDismissed(window.localStorage.getItem(TIP_DISMISSED_KEY) === '1')
    } catch {
      // Private mode / disabled storage — show tip every session is fine.
    }
  }, [])

  const dismissTip = useCallback(() => {
    setTipDismissed(true)
    try {
      window.localStorage.setItem(TIP_DISMISSED_KEY, '1')
    } catch {
      // ignore
    }
  }, [])

  const summary = summarizeStatuses(canvas.nodes)
  const modelBySlug = useMemo(
    () => new Map((models || []).map((m) => [m.slug, m])),
    [models],
  )

  const editingNode = useMemo(
    () => (editingNodeId ? canvas.nodes.find((n) => n.id === editingNodeId) || null : null),
    [editingNodeId, canvas.nodes],
  )

  // Patch a single node by id. Used both by run() and the edit sheet.
  const patchNode = useCallback((nodeId: string, patch: Partial<CanvasNode['data']>) => {
    setCanvas((c) => ({
      ...c,
      nodes: c.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    }))
  }, [])

  const run = useCallback(async () => {
    if (running) return
    if (canvas.nodes.length === 0) {
      toast.error('Canvas is empty')
      return
    }
    setRunning(true)
    const ctrl = new AbortController()
    setAbortCtrl(ctrl)
    // Reset run state so re-runs don't show stale errors.
    setCanvas((c) => ({
      ...c,
      nodes: c.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle', error: undefined },
      })),
    }))
    try {
      await runCanvas(canvas, {
        signal: ctrl.signal,
        getWhopHeaders,
        onNodeUpdate: (nodeId, patch) => patchNode(nodeId, patch),
      })
      toast.success('Done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg !== 'Aborted') toast.error(`Run failed: ${msg}`)
    } finally {
      setRunning(false)
      setAbortCtrl(null)
    }
  }, [running, canvas, getWhopHeaders, patchNode])

  const stop = useCallback(() => {
    abortCtrl?.abort()
  }, [abortCtrl])

  const openEditor = useCallback(
    (nodeId: string) => {
      if (running) return // don't let users mutate state mid-run
      setEditingNodeId(nodeId)
    },
    [running],
  )

  const onSheetSave = useCallback(
    (patch: Partial<CanvasNode['data']>) => {
      if (!editingNodeId) return
      patchNode(editingNodeId, patch)
      // First-edit dismisses the "view-only" tip permanently.
      if (!tipDismissed) dismissTip()
    },
    [editingNodeId, patchNode, tipDismissed, dismissTip],
  )

  // Display order: visual outputs first (image-gen, video-gen, output, fan-
  // out), then inputs (text-prompt, reference-image, entity, skill,
  // orchestrator). Within a group, preserve canvas insertion order.
  const visibleNodes = useMemo(() => sortForMobile(canvas.nodes), [canvas.nodes])
  const hasNodes = visibleNodes.length > 0
  const sheetModel =
    editingNode?.data.modelSlug ? modelBySlug.get(editingNode.data.modelSlug) : undefined
  const gridClass =
    bp === 'tablet' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black text-white">
      {/* Sticky header */}
      <header
        className="sticky top-0 z-30 bg-black/85 backdrop-blur-md border-b border-white/[0.06]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div
          className="h-14 flex items-center gap-2.5"
          style={{
            paddingLeft: 'max(0.875rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.875rem, env(safe-area-inset-right))',
          }}
        >
          <Link
            href="/canvas"
            aria-label="Back to canvas list"
            className="w-9 h-9 rounded-md bg-white/[0.04] ring-1 ring-white/[0.08] flex items-center justify-center text-zinc-300 active:bg-white/[0.08]"
          >
            <ArrowLeft size={15} />
          </Link>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Image
              src="/skinny-logo.svg"
              alt="Skinny Studio"
              width={20}
              height={20}
              priority
              className="shrink-0 opacity-90"
            />
            <h1 className="text-sm font-semibold text-white truncate">{canvas.title}</h1>
          </div>

          {running ? (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={stop}
              className="h-9 px-3.5 rounded-md bg-red-500/15 ring-1 ring-red-500/40 text-xs font-semibold text-red-300 flex items-center gap-1.5 active:bg-red-500/25"
            >
              <Square size={12} fill="currentColor" />
              Stop
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={run}
              disabled={!hasNodes}
              className="h-9 px-3.5 rounded-md bg-skinny-yellow text-zinc-900 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:bg-skinny-yellow/40 disabled:text-zinc-700 active:bg-skinny-yellow/90"
            >
              <Play size={12} fill="currentColor" />
              Run
            </motion.button>
          )}
        </div>

        {/* Status / summary bar */}
        <div
          className="px-4 pb-2 pt-0.5 flex items-center gap-3 text-[11px] text-zinc-500"
          style={{
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
          }}
        >
          <SummaryPills summary={summary} total={canvas.nodes.length} />
          {bp === 'phone' && (
            <span className="ml-auto text-zinc-600 truncate">Tap a card to edit</span>
          )}
        </div>
      </header>

      {/* Tip strip — dismisses on first edit, or via the close button */}
      {!tipDismissed && hasNodes && (
        <div
          className="mx-4 mt-3 rounded-lg bg-skinny-yellow/[0.06] ring-1 ring-skinny-yellow/20 px-3 py-2.5 flex items-start gap-2.5"
          style={{
            marginLeft: 'max(1rem, env(safe-area-inset-left))',
            marginRight: 'max(1rem, env(safe-area-inset-right))',
          }}
          role="status"
        >
          <Sparkles size={13} className="text-skinny-yellow mt-0.5 shrink-0" />
          <p className="flex-1 text-[11px] leading-relaxed text-zinc-300">
            Mobile shows a simplified view. Tap any card to edit its prompt or settings.
            Open on desktop for the full node editor.
          </p>
          <button
            onClick={dismissTip}
            aria-label="Dismiss tip"
            className="text-zinc-500 hover:text-zinc-300 text-[11px] font-semibold shrink-0 -mr-1"
          >
            Got it
          </button>
        </div>
      )}

      {/* Body */}
      <main
        className="flex-1"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
          paddingTop: '0.75rem',
        }}
      >
        {!hasNodes ? (
          <EmptyState />
        ) : (
          <div className={gridClass}>
            {visibleNodes.map((n) => (
              <MobileNodeCard
                key={n.id}
                node={n}
                onEdit={() => openEditor(n.id)}
                editable={!running}
              />
            ))}
          </div>
        )}
      </main>

      <MobileNodeSheet
        open={!!editingNodeId}
        node={editingNode}
        model={sheetModel}
        onClose={() => setEditingNodeId(null)}
        onSave={onSheetSave}
      />
    </div>
  )
}

// ===== Empty state =====
function EmptyState() {
  return (
    <div className="mt-16 mx-auto max-w-xs text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] flex items-center justify-center mb-4">
        <Layers size={20} className="text-zinc-500" />
      </div>
      <p className="text-xs uppercase tracking-widest text-zinc-600 mb-2">No nodes yet</p>
      <p className="text-sm text-zinc-400 leading-relaxed">
        This canvas is empty. Open it on desktop to start building your graph.
      </p>
      <Link
        href="/canvas"
        className="inline-flex mt-5 px-3.5 py-2 rounded-md bg-white/[0.05] ring-1 ring-white/[0.08] text-xs font-medium text-zinc-200 active:bg-white/[0.1]"
      >
        Back to canvases
      </Link>
    </div>
  )
}

// ===== Summary pills (counts by status) =====
function SummaryPills({
  summary,
  total,
}: {
  summary: Record<NodeStatus, number>
  total: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-400 tabular-nums">
        {summary.done}/{total}
      </span>
      {summary.running > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-[10px]">
          {summary.running} running
        </span>
      )}
      {summary.error > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px]">
          {summary.error} error{summary.error === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

// ===== Per-node card =====
function MobileNodeCard({
  node,
  onEdit,
  editable,
}: {
  node: CanvasNode
  onEdit: () => void
  editable: boolean
}) {
  const def = NODE_TYPES[node.type]
  const title = node.data.title || node.data.modelName || def.label
  const hasOutputs = (node.data.outputUrls?.length ?? 0) > 0
  const isVisual = node.type === 'image-gen' || node.type === 'video-gen' || node.type === 'fan-out' || node.type === 'output'
  const cost = typeof node.data.costCents === 'number' ? formatCents(node.data.costCents) : null

  return (
    <button
      onClick={onEdit}
      disabled={!editable}
      className="group text-left w-full rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] overflow-hidden active:bg-white/[0.05] disabled:active:bg-white/[0.03] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50"
      aria-label={`Edit ${title}`}
    >
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 border-b border-white/[0.06]">
        <NodeTypeBadge type={node.type} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-zinc-100 truncate leading-tight">{title}</div>
          {node.data.modelName && node.data.modelName !== title && (
            <div className="text-[10px] text-zinc-500 truncate leading-tight mt-0.5">
              {node.data.modelName}
            </div>
          )}
        </div>
        <StatusPill status={node.data.status} />
        {editable && (
          <Pencil size={11} className="text-zinc-600 group-active:text-zinc-400 shrink-0" aria-hidden />
        )}
      </div>

      <div className="p-2.5 space-y-2">
        {/* Visual nodes get an output preview */}
        {isVisual && (
          hasOutputs ? (
            <OutputGrid node={node} />
          ) : (
            <div className="aspect-video rounded-md bg-white/[0.02] ring-1 ring-dashed ring-white/[0.06] flex items-center justify-center">
              {node.data.status === 'running' ? (
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                  Generating…
                </div>
              ) : node.data.status === 'error' ? (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-400 px-3 text-center">
                  <AlertCircle size={11} />
                  <span className="line-clamp-2">{node.data.error || 'Failed'}</span>
                </div>
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-zinc-600">No output yet</span>
              )}
            </div>
          )
        )}

        {/* Text nodes: prompt preview */}
        {(node.type === 'text-prompt' || node.type === 'skill') && (
          <PromptPreview text={node.data.prompt} />
        )}

        {/* Reference image: tiny thumbnail */}
        {node.type === 'reference-image' && (
          node.data.imageUrl ? (
            <div className="aspect-video rounded-md overflow-hidden bg-black/40 ring-1 ring-white/[0.05]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={node.data.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
              />
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 italic px-1 py-2">No image set.</p>
          )
        )}

        {/* Footer line: model + cost */}
        {(node.data.modelSlug || cost) && (
          <div className="flex items-center justify-between gap-2 pt-1">
            {node.data.modelSlug ? (
              <span className="text-[10px] text-zinc-500 font-mono truncate">{node.data.modelSlug}</span>
            ) : (
              <span />
            )}
            {cost && (
              <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">{cost}</span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

function OutputGrid({ node }: { node: CanvasNode }) {
  const urls = node.data.outputUrls || []
  const isVideo = node.type === 'video-gen'
  // 1 output → full width; 2+ → 2-col grid.
  if (urls.length === 1) {
    const u = urls[0]
    return (
      <div className="rounded-md overflow-hidden bg-black/40">
        {isVideo ? (
          <video
            src={u}
            className="w-full aspect-video object-cover"
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u} alt="" className="w-full aspect-square object-cover" loading="lazy" />
        )}
      </div>
    )
  }
  return (
    <div className="relative grid grid-cols-2 gap-1.5">
      {urls.slice(0, 4).map((u, i) =>
        isVideo ? (
          <video
            key={i}
            src={u}
            className="w-full aspect-video object-cover rounded-md bg-black/40"
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={u}
            alt=""
            className="w-full aspect-square object-cover rounded-md bg-black/40"
            loading="lazy"
          />
        ),
      )}
      {urls.length > 4 && (
        <div className="absolute right-2 bottom-2 text-[10px] text-zinc-300 bg-black/70 rounded-full px-1.5 py-0.5">
          +{urls.length - 4}
        </div>
      )}
    </div>
  )
}

function PromptPreview({ text }: { text?: string }) {
  const trimmed = (text || '').trim()
  if (!trimmed) {
    return <p className="text-[11px] text-zinc-500 italic px-1 py-1.5">No prompt set yet.</p>
  }
  return (
    <p className="text-[12px] leading-relaxed text-zinc-300 line-clamp-3 whitespace-pre-wrap px-1 py-1">
      {trimmed}
    </p>
  )
}

function StatusPill({ status }: { status: NodeStatus }) {
  const cfg: Record<NodeStatus, { label: string; cls: string }> = {
    idle: { label: 'idle', cls: 'bg-white/[0.04] text-zinc-500' },
    queued: { label: 'queued', cls: 'bg-amber-500/15 text-amber-300' },
    running: { label: 'running', cls: 'bg-sky-500/15 text-sky-300' },
    done: { label: 'done', cls: 'bg-emerald-500/15 text-emerald-300' },
    error: { label: 'error', cls: 'bg-rose-500/15 text-rose-300' },
  }
  const c = cfg[status]
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums ${c.cls}`}>
      {c.label}
    </span>
  )
}

function NodeTypeBadge({ type }: { type: NodeType }) {
  const map: Record<NodeType, { Icon: React.ComponentType<{ size?: number; className?: string }>; tint: string }> = {
    'text-prompt': { Icon: FileText, tint: 'text-zinc-300' },
    'reference-image': { Icon: ImageIcon, tint: 'text-zinc-300' },
    entity: { Icon: Box, tint: 'text-zinc-300' },
    skill: { Icon: Sparkles, tint: 'text-skinny-yellow' },
    'image-gen': { Icon: ImageIcon, tint: 'text-zinc-300' },
    'video-gen': { Icon: Film, tint: 'text-zinc-300' },
    'fan-out': { Icon: Layers, tint: 'text-zinc-300' },
    output: { Icon: CircleDot, tint: 'text-zinc-300' },
    orchestrator: { Icon: Sparkles, tint: 'text-zinc-300' },
    'production-brief': { Icon: FileText, tint: 'text-zinc-300' },
  }
  const { Icon, tint } = map[type]
  return (
    <div className="w-7 h-7 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] flex items-center justify-center shrink-0">
      <Icon size={13} className={tint} />
    </div>
  )
}

// Visual outputs first, then inputs/utilities. Stable within each group.
function sortForMobile(nodes: CanvasNode[]): CanvasNode[] {
  const rank: Record<NodeType, number> = {
    'image-gen': 0,
    'video-gen': 0,
    output: 0,
    'fan-out': 0,
    'text-prompt': 1,
    skill: 1,
    'reference-image': 1,
    entity: 1,
    orchestrator: 2,
    'production-brief': 2,
  }
  return [...nodes].sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9))
}

function formatCents(cents: number): string {
  if (cents < 100) return `${cents}¢`
  return `$${(cents / 100).toFixed(2)}`
}
