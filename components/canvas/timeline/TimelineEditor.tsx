'use client'

// Top-level timeline editor shell. Composes:
//
//   Header (title · save status · settings · export)
//   ┌───────────────────────────────────┬───────────┐
//   │ Preview                            │ Clip      │
//   │                                    │ drawer    │
//   ├────────────────────────────────────┤ (desktop) │
//   │ Transport                          │           │
//   ├────────────────────────────────────┴───────────┤
//   │ Tracks rail (scrubber + tracks + clips)        │
//   └────────────────────────────────────────────────┘
//
// On phones (< sm) we render a friendly "switch to desktop" screen instead,
// with the export-existing-render button so mobile users can still grab their
// last render.

import { MotionConfig } from 'framer-motion'
import {
  Film,
  Loader2,
  Monitor,
  Music,
  Redo2,
  Scissors,
  Undo2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  blankTimeline,
  type Timeline,
  type TimelineClip,
} from '@/lib/timeline/ir'
import { TimelineProvider, useTimeline, nextClipStartOnTrack } from '@/lib/timeline/use-timeline'
import { TimelineTracksRail } from './TimelineTracksRail'
import { TimelinePreview } from './TimelinePreview'
import { TimelineTransport } from './TimelineTransport'
import { TimelineClipDrawer } from './TimelineClipDrawer'
import { TimelineExportButton } from './TimelineExportButton'
import { TimelineEmptyState } from './TimelineEmptyState'
import { TimelineSettingsDropdown } from './TimelineSettingsDropdown'
import { TimelineAudioUploader } from './TimelineAudioUploader'
import { ShortcutsCheatsheet } from './ShortcutsCheatsheet'
import {
  TimelineLibraryPanel,
  type CanvasVideoNodeLite,
  type HubVideoGen,
  type TimelineDragPayload,
} from './TimelineLibraryPanel'
import { MIN_ZOOM, MAX_ZOOM } from './timeline-constants'

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface TimelineEditorProps {
  canvasId: string
  /** Available canvas video-gen nodes for the clip picker. */
  canvasVideoNodes?: CanvasVideoNodeLite[]
  /** Wired by CanvasShell to drop a rendered MP4 back into the canvas as an Output node. */
  onAddRenderToCanvas?(publicUrl: string): void
  /** Fired when the user clicks the Canvas pill in the mode selector. */
  onSwitchToCanvas?: () => void
  /** Returns Whop auth headers (token + content-type) for every backend call.
   *  REQUIRED — without it, all /api/canvas/[id]/timeline/* routes 401 and
   *  the editor silently falls back to local-only state. */
  getWhopHeaders: () => Record<string, string>
}

export function TimelineEditor(props: TimelineEditorProps) {
  return (
    <MotionConfig reducedMotion="user">
      <TimelineProvider canvasId={props.canvasId} getWhopHeaders={props.getWhopHeaders}>
        <TimelineEditorInner {...props} />
      </TimelineProvider>
    </MotionConfig>
  )
}

// ---------------------------------------------------------------------------
// Inner editor (has access to the hook)
// ---------------------------------------------------------------------------

function TimelineEditorInner({ canvasVideoNodes = [], onAddRenderToCanvas, onSwitchToCanvas, getWhopHeaders }: TimelineEditorProps) {
  const {
    timeline,
    loading,
    saving,
    hasUnsavedChanges,
    error,
    selectedClipId,
    setSelectedClipId,
    addClip,
    updateClip,
    removeClip,
    splitClipAt,
    addUpload,
    setSettings,
    playhead,
    setPlayhead,
    playing,
    togglePlay,
    stepFrame,
    undo,
    redo,
    canUndo,
    canRedo,
    canvasId,
  } = useTimeline()

  const [zoom, setZoom] = useState(1)
  const [hubVideoGens, setHubVideoGens] = useState<HubVideoGen[]>([])
  const [tool, setTool] = useState<'select' | 'razor'>('select')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [isPhone, setIsPhone] = useState(false)
  // Trigger audio file picker from anywhere (library "+" button → uploader).
  const audioPickRef = useRef<() => void>(() => {})

  // Track viewport — phones get the "use desktop" screen.
  useEffect(() => {
    function check() {
      setIsPhone(window.innerWidth < 640)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Fetch the user's Skinny Hub video generations once on mount. These appear
  // as a separate library section alongside this canvas's own video-gen
  // outputs, so users can pull ANY prior gen onto the timeline.
  useEffect(() => {
    let cancelled = false
    fetch('/api/users/generations?status=succeeded&limit=50', {
      headers: getWhopHeaders(),
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const json = (await res.json()) as {
          generations?: Array<{
            id: string
            output_urls?: string[]
            prompt?: string
            model_slug?: string
            model_category?: string
            created_at?: string
          }>
        }
        const vids: HubVideoGen[] = (json.generations || [])
          .filter(
            (g) =>
              g.model_category === 'video' &&
              Array.isArray(g.output_urls) &&
              g.output_urls.length > 0,
          )
          .map((g) => ({
            id: g.id,
            url: g.output_urls![0],
            title: (g.prompt || g.model_slug || 'Video').slice(0, 60),
            durationSeconds: 0, // probed lazily by the row
            createdAt: g.created_at || '',
          }))
        if (!cancelled) setHubVideoGens(vids)
      })
      .catch(() => {
        /* Hub is a nice-to-have; silent failure is fine */
      })
    return () => {
      cancelled = true
    }
  }, [getWhopHeaders])

  // Re-open drawer when a new clip is selected (desktop only).
  useEffect(() => {
    if (selectedClipId) setDrawerOpen(true)
  }, [selectedClipId])

  // Compose label lookup for video-gen nodes by id.
  const labelByNodeId = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of canvasVideoNodes) {
      if (node.data.title) map.set(node.id, node.data.title)
    }
    return map
  }, [canvasVideoNodes])

  const getClipLabel = useCallback(
    (clip: TimelineClip) => {
      if (clip.source.kind === 'canvas-node') {
        return labelByNodeId.get(clip.source.nodeId) || 'Canvas clip'
      }
      // upload: use uploads list
      if (clip.source.kind === 'upload' && timeline) {
        const up = timeline.uploads.find((u) => u.id === (clip.source as any).uploadId)
        if (up) return up.filename
      }
      return undefined
    },
    [labelByNodeId, timeline],
  )

  // Drop handler — fires from TimelineTracksRail. Drops a library asset on
  // the given track at the given timeline-time.
  const onAssetDrop = useCallback(
    (payload: TimelineDragPayload, atTime: number, trackId: string) => {
      addClip({
        trackId,
        source:
          payload.kind === 'canvas-node'
            ? { kind: 'canvas-node', nodeId: payload.nodeId }
            : { kind: 'upload', uploadId: payload.uploadId },
        sourceUrl: payload.url,
        sourceStart: 0,
        sourceEnd: payload.duration > 0 ? payload.duration : 5,
        timelineStart: Math.max(0, atTime),
      })
    },
    [addClip],
  )

  // "Add to end of track" — used by the library's click/double-click + the
  // big "+" button on each row when drag-drop isn't practical (e.g. keyboard).
  const onLibraryAdd = useCallback(
    (payload: TimelineDragPayload) => {
      if (!timeline) return
      // Pick the matching track kind.
      const targetKind =
        payload.kind === 'canvas-node' ? 'video' : payload.mediaKind
      const track = timeline.tracks.find((t) => t.kind === targetKind)
      if (!track) return
      const start = nextClipStartOnTrack(timeline, track.id)
      onAssetDrop(payload, start, track.id)
    },
    [timeline, onAssetDrop],
  )

  // C / Cmd+B: split selected clip at playhead.
  const onSplitAtPlayhead = useCallback(() => {
    if (!selectedClipId) return
    splitClipAt(selectedClipId, playhead)
  }, [splitClipAt, selectedClipId, playhead])

  // Editor-level shortcuts. Use-timeline already handles Space, ←/→, Cmd+Z,
  // [/], etc. We add the workflow ones: V/B (tools), C (split), Home/End
  // (scrub), +/-/Z (zoom), J/K/L (transport — pro convention).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      // Skip modifiers for plain letter shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault()
        setTool('select')
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        setTool('razor')
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        onSplitAtPlayhead()
      } else if (e.key === 'Home') {
        e.preventDefault()
        setPlayhead(0)
      } else if (e.key === 'End' && timeline) {
        e.preventDefault()
        setPlayhead(timeline.durationSeconds)
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))
      } else if (e.key === 'j' || e.key === 'J') {
        // J = rewind (skip back 1s; press again to skip more)
        e.preventDefault()
        if (timeline) setPlayhead(Math.max(0, playhead - 1))
      } else if (e.key === 'k' || e.key === 'K') {
        // K = stop (pause)
        e.preventDefault()
        if (playing) togglePlay()
      } else if (e.key === 'l' || e.key === 'L') {
        // L = forward (skip ahead 1s)
        e.preventDefault()
        if (timeline) setPlayhead(Math.min(timeline.durationSeconds, playhead + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSplitAtPlayhead, timeline, playhead, playing, togglePlay, setPlayhead])

  // Razor tool — click any clip to split it at the click position.
  const onClipClickInRazorMode = useCallback(
    (clipId: string, atTime: number) => {
      splitClipAt(clipId, atTime)
      setTool('select')
    },
    [splitClipAt],
  )

  if (loading || !timeline) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <Loader2 className="h-6 w-6 animate-spin text-skinny-yellow" />
          <span className="text-sm">Loading timeline…</span>
        </div>
      </div>
    )
  }

  // Phone fallback
  if (isPhone) {
    return <PhoneFallback timeline={timeline} />
  }

  const selectedClip =
    selectedClipId ? timeline.clips.find((c) => c.id === selectedClipId) ?? null : null
  const selectedTrack = selectedClip
    ? timeline.tracks.find((t) => t.id === selectedClip.trackId)
    : undefined

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-black text-white"
      data-timeline-editor
    >
      {/* Header — slim, Skinny-native. Mode pill at the start so users can
          jump back to Canvas from anywhere inside the timeline editor. */}
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-white/[0.06] bg-zinc-950/95 px-3 backdrop-blur-md">
        {/* Mode pill — Canvas / Timeline. Mirrors the LeftRail's selector
            visual language so swapping back and forth feels native. */}
        <div className="inline-flex items-center gap-0.5 rounded-md bg-black/40 ring-1 ring-white/[0.06] p-0.5">
          <ToolBtn
            active={false}
            onClick={() => onSwitchToCanvas?.()}
            label="Canvas"
            hint="1"
          >
            <Workflow className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn
            active={true}
            onClick={() => {/* already in timeline */}}
            label="Timeline"
            hint="2"
          >
            <Film className="h-3.5 w-3.5" />
          </ToolBtn>
        </div>

        <Divider />

        {/* Tool palette — segmented control, primary action zone. */}
        <div className="inline-flex items-center gap-0.5 rounded-md bg-black/40 ring-1 ring-white/[0.06] p-0.5">
          <ToolBtn
            active={tool === 'select'}
            onClick={() => setTool('select')}
            label="Select"
            hint="V"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M5.5 3.21V20.79c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36Z" />
            </svg>
          </ToolBtn>
          <ToolBtn
            active={tool === 'razor'}
            onClick={() => setTool('razor')}
            label="Razor"
            hint="B"
          >
            <Scissors className="h-3.5 w-3.5" />
          </ToolBtn>
        </div>

        <Divider />

        <HeaderBtn aria-label="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn aria-label="Redo (⌘⇧Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 className="h-3.5 w-3.5" />
        </HeaderBtn>

        <Divider />

        {/* Compact zoom widget */}
        <div className="inline-flex items-center gap-0.5 rounded-md ring-1 ring-white/[0.06] p-0.5">
          <HeaderBtn
            aria-label="Zoom out (-)"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))}
            size="xs"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </HeaderBtn>
          <span className="px-1.5 text-[10px] font-medium tabular-nums text-white/50">
            {Math.round(zoom * 100)}%
          </span>
          <HeaderBtn
            aria-label="Zoom in (+)"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))}
            size="xs"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </HeaderBtn>
        </div>

        {/* Quiet save status — small dot, full text only on hover via title. */}
        <SaveDot saving={saving} unsaved={hasUnsavedChanges} error={!!error} />

        <div className="ml-auto flex items-center gap-1.5">
          {/* Hidden audio uploader — the library's "+" button triggers it. */}
          <span className="hidden">
            <TimelineAudioUploader
              canvasId={canvasId}
              timeline={timeline}
              onUploadAdded={addUpload}
              onClipAdded={addClip}
              getWhopHeaders={getWhopHeaders}
              pickerRef={audioPickRef}
            />
          </span>
          <TimelineSettingsDropdown timeline={timeline} onChange={setSettings} />
          <TimelineExportButton
            timeline={timeline}
            canvasId={canvasId}
            onAddToCanvas={onAddRenderToCanvas}
            getWhopHeaders={getWhopHeaders}
          />
        </div>
      </header>

      {/* Body — library | preview+transport | drawer */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: persistent asset library */}
        <TimelineLibraryPanel
          canvasNodes={canvasVideoNodes}
          hubVideoGens={hubVideoGens}
          uploads={timeline.uploads}
          onAdd={onLibraryAdd}
          onUploadAudio={() => audioPickRef.current?.()}
          collapsed={libraryCollapsed}
          onToggleCollapse={() => setLibraryCollapsed((v) => !v)}
        />

        {/* Center: preview + transport */}
        <div className="flex min-w-0 flex-1 flex-col">
          {timeline.clips.length === 0 ? (
            <TimelineEmptyState onOpenClipPicker={() => setLibraryCollapsed(false)} />
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-hidden p-3">
                <TimelinePreview timeline={timeline} playhead={playhead} playing={playing} />
              </div>
              <TimelineTransport
                playing={playing}
                playhead={playhead}
                duration={timeline.durationSeconds}
                fps={timeline.fps}
                onPlayToggle={togglePlay}
                onSeek={setPlayhead}
                onStepFrame={stepFrame}
              />
            </>
          )}
        </div>

        {/* Right: clip drawer */}
        {selectedClip && drawerOpen ? (
          <TimelineClipDrawer
            clip={selectedClip}
            track={selectedTrack}
            onChange={(patch) => updateClip(selectedClip.id, patch)}
            onDelete={() => {
              removeClip(selectedClip.id)
              setDrawerOpen(false)
            }}
            onClose={() => {
              setDrawerOpen(false)
              setSelectedClipId(null)
            }}
            variant="side"
          />
        ) : null}
      </div>

      {/* Tracks rail (bottom). In razor mode the cursor flips + click splits. */}
      <div
        className={cn(
          'min-h-[200px] basis-[36%]',
          tool === 'razor' && '[&_*]:cursor-crosshair',
        )}
      >
        <TimelineTracksRail
          timeline={timeline}
          zoom={zoom}
          playhead={playhead}
          selectedClipId={selectedClipId}
          onPlayheadChange={setPlayhead}
          onClipSelect={(id) => {
            // In razor mode, "selecting" a clip means splitting at the
            // playhead position if it falls inside that clip.
            if (tool === 'razor' && id) {
              const c = timeline.clips.find((c) => c.id === id)
              if (c) onClipClickInRazorMode(id, playhead)
              return
            }
            setSelectedClipId(id)
          }}
          onClipChange={updateClip}
          getClipLabel={getClipLabel}
          onAssetDrop={onAssetDrop}
        />
      </div>

      <ShortcutsCheatsheet />
    </div>
  )
}

function ToolBtn({
  active,
  onClick,
  label,
  hint,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} tool (${hint})`}
      title={`${label} (${hint})`}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
        active
          ? 'bg-skinny-yellow text-black shadow-[0_0_12px_-4px_rgba(214,252,81,0.5)]'
          : 'text-white/55 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeaderBtn({
  children,
  size = 'sm',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'xs' | 'sm' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-white/65 transition-colors',
        size === 'xs' ? 'h-6 w-6' : 'h-7 w-7',
        'hover:bg-white/[0.06] hover:text-white',
        'focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none',
        'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/65',
        rest.className,
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-white/[0.06]" />
}

/** Tiny status dot. Color-codes save state without taking header real estate.
 *  Hover tooltip carries the full message. */
function SaveDot({
  saving,
  unsaved,
  error,
}: {
  saving: boolean
  unsaved: boolean
  error: boolean
}) {
  const { dot, title } = (() => {
    if (error) return { dot: 'bg-rose-400', title: 'Sync error — your edits are local-only.' }
    if (saving) return { dot: 'bg-amber-300 animate-pulse', title: 'Saving…' }
    if (unsaved) return { dot: 'bg-white/40', title: 'Unsaved changes.' }
    return { dot: 'bg-skinny-green/80', title: 'All changes saved.' }
  })()
  return (
    <span
      title={title}
      aria-label={title}
      className="ml-2 inline-flex h-7 w-7 items-center justify-center"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
    </span>
  )
}

function PhoneFallback({ timeline }: { timeline: Timeline }) {
  const lastRender = timeline.lastRenderedUrl
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-8 text-center text-white">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-skinny-yellow/15 text-skinny-yellow">
        <Monitor className="h-7 w-7" />
      </span>
      <h2 className="font-display text-2xl uppercase tracking-tight">Use desktop for video editing</h2>
      <p className="max-w-sm text-sm text-white/60">
        The timeline editor needs more room than your phone gives. Hop over to a laptop or tablet for the full editing experience.
      </p>
      {lastRender ? (
        <a
          href={lastRender}
          download
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-skinny-yellow px-4 py-2.5 text-sm font-semibold text-black"
        >
          <Music className="h-4 w-4" />
          Download last render
        </a>
      ) : null}
    </div>
  )
}
