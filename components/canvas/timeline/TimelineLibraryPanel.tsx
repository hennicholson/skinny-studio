'use client'

// Persistent left panel that holds every asset the user can drop on the
// timeline:
//   - Canvas video-gen output nodes (live thumbnails from outputUrls[0])
//   - User-uploaded audio + video (timeline.uploads)
//
// Items are HTML5-draggable. Drop target is TimelineTracksRail.
//
// This replaces the modal TimelineClipPicker that was a slide-in overlay.
// Asset library is now a first-class surface — that's the end-to-end
// workflow: pick from canvas / upload here → drag onto the rail.

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Music,
  Film,
  Plus,
  ChevronDown,
  ChevronRight,
  Upload,
  FileAudio2,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineUpload } from '@/lib/timeline/ir'
import { formatTimecode } from '@/lib/timeline/ir'

export interface CanvasVideoNodeLite {
  id: string
  type: string
  data: { title?: string; outputUrls?: string[] }
}

// MIME we set on the DataTransfer when dragging an item. The rail listens for
// this exact type and parses the JSON payload.
export const TIMELINE_DRAG_MIME = 'application/x-skinny-timeline-asset'

export type TimelineDragPayload =
  | { kind: 'canvas-node'; nodeId: string; url: string; duration: number; label?: string }
  | { kind: 'upload'; uploadId: string; url: string; duration: number; mediaKind: 'audio' | 'video'; label?: string }

interface TimelineLibraryPanelProps {
  canvasNodes: CanvasVideoNodeLite[]
  uploads: TimelineUpload[]
  /** Called when the user clicks an item (or double-clicks) to add at the end
   *  of the appropriate track. Drag-and-drop bypasses this and goes through
   *  the rail's drop handler. */
  onAdd?: (payload: TimelineDragPayload) => void
  /** Trigger an audio file pick. The audio uploader handles the actual upload
   *  and registers the upload + clip via the hook. */
  onUploadAudio?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function TimelineLibraryPanel({
  canvasNodes,
  uploads,
  onAdd,
  onUploadAudio,
  collapsed = false,
  onToggleCollapse,
}: TimelineLibraryPanelProps) {
  const videoUploads = uploads.filter((u) => (u.kind ?? 'video') === 'video')
  const audioUploads = uploads.filter((u) => u.kind === 'audio' || u.contentType?.startsWith('audio'))

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950/95 backdrop-blur-md transition-[width] duration-200',
        collapsed ? 'w-11' : 'w-[232px]',
      )}
      aria-label="Asset library"
    >
      {/* Header */}
      <header className="flex h-12 items-center gap-2 border-b border-white/[0.06] px-3">
        <h2 className={cn(
          'flex-1 font-display text-[10px] uppercase tracking-[0.22em] text-white/50',
          collapsed && 'sr-only',
        )}>
          Library
        </h2>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand library' : 'Collapse library'}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5 -rotate-90" />}
          </button>
        )}
      </header>

      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
          {/* Canvas videos */}
          <LibrarySection
            label="Canvas videos"
            icon={<Film className="h-3 w-3" />}
            count={canvasNodes.length}
            empty="Generate a video on the canvas to drag it in."
          >
            {canvasNodes.map((node) => (
              <CanvasNodeRow key={node.id} node={node} onAdd={onAdd} />
            ))}
          </LibrarySection>

          {/* Uploaded video */}
          {videoUploads.length > 0 && (
            <LibrarySection
              label="Uploaded video"
              icon={<Film className="h-3 w-3" />}
              count={videoUploads.length}
            >
              {videoUploads.map((u) => (
                <UploadVideoRow key={u.id} upload={u} onAdd={onAdd} />
              ))}
            </LibrarySection>
          )}

          {/* Audio */}
          <LibrarySection
            label="Audio"
            icon={<Music className="h-3 w-3" />}
            count={audioUploads.length}
            empty="Upload an MP3 or WAV — drag it onto the audio track."
            action={onUploadAudio && (
              <button
                type="button"
                onClick={onUploadAudio}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-skinny-yellow transition-colors hover:bg-skinny-yellow/10 focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none"
                aria-label="Upload audio"
                title="Upload audio"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          >
            {audioUploads.map((u) => (
              <UploadAudioRow key={u.id} upload={u} onAdd={onAdd} />
            ))}
          </LibrarySection>
        </div>
      )}

      {/* Collapsed quick-actions rail */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1.5 py-2 text-white/40">
          <span className="inline-flex h-7 w-7 items-center justify-center" title="Canvas videos">
            <Film className="h-3.5 w-3.5" />
          </span>
          <span className="inline-flex h-7 w-7 items-center justify-center" title="Audio">
            <Music className="h-3.5 w-3.5" />
          </span>
          {onUploadAudio && (
            <button
              type="button"
              onClick={onUploadAudio}
              aria-label="Upload audio"
              title="Upload audio"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-skinny-yellow transition-colors hover:bg-skinny-yellow/10 focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

// ─── Section header + collapsible group ───────────────────────────────────

function LibrarySection({
  label,
  icon,
  count,
  empty,
  action,
  children,
}: {
  label: string
  icon: React.ReactNode
  count: number
  empty?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <span className="text-white/40">{icon}</span>
        <h3 className="flex-1 text-[10px] font-medium uppercase tracking-wider text-white/50">
          {label}
        </h3>
        <span className="text-[10px] tabular-nums text-white/30">{count}</span>
        {action}
      </div>
      {count === 0 ? (
        <p className="px-2 py-3 text-[11px] leading-snug text-white/35">{empty}</p>
      ) : (
        <ul className="space-y-1">{children}</ul>
      )}
    </section>
  )
}

// ─── Row variants ─────────────────────────────────────────────────────────

function CanvasNodeRow({
  node,
  onAdd,
}: {
  node: CanvasVideoNodeLite
  onAdd?: (p: TimelineDragPayload) => void
}) {
  const url = node.data.outputUrls?.[0] ?? ''
  const label = node.data.title || 'Canvas clip'
  const duration = useMediaDuration(url, 'video')
  const payload: TimelineDragPayload = {
    kind: 'canvas-node',
    nodeId: node.id,
    url,
    duration: duration || 5,
    label,
  }
  return (
    <LibraryRow
      thumbnail={<VideoThumb url={url} />}
      label={label}
      sub={duration ? formatTimecode(duration, false) : '—'}
      payload={payload}
      onAdd={onAdd}
    />
  )
}

function UploadVideoRow({
  upload,
  onAdd,
}: {
  upload: TimelineUpload
  onAdd?: (p: TimelineDragPayload) => void
}) {
  const payload: TimelineDragPayload = {
    kind: 'upload',
    uploadId: upload.id,
    url: upload.url,
    duration: upload.durationSeconds || 5,
    mediaKind: 'video',
    label: upload.filename,
  }
  return (
    <LibraryRow
      thumbnail={<VideoThumb url={upload.url} />}
      label={upload.filename}
      sub={formatTimecode(upload.durationSeconds, false)}
      payload={payload}
      onAdd={onAdd}
    />
  )
}

function UploadAudioRow({
  upload,
  onAdd,
}: {
  upload: TimelineUpload
  onAdd?: (p: TimelineDragPayload) => void
}) {
  const payload: TimelineDragPayload = {
    kind: 'upload',
    uploadId: upload.id,
    url: upload.url,
    duration: upload.durationSeconds || 5,
    mediaKind: 'audio',
    label: upload.filename,
  }
  return (
    <LibraryRow
      thumbnail={
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-skinny-green/15 ring-1 ring-skinny-green/30 text-skinny-green">
          <FileAudio2 className="h-4 w-4" />
        </div>
      }
      label={upload.filename}
      sub={formatTimecode(upload.durationSeconds, false)}
      payload={payload}
      onAdd={onAdd}
    />
  )
}

// ─── Shared row shell with drag handle + click-to-add ─────────────────────

function LibraryRow({
  thumbnail,
  label,
  sub,
  payload,
  onAdd,
}: {
  thumbnail: React.ReactNode
  label: string
  sub: string
  payload: TimelineDragPayload
  onAdd?: (p: TimelineDragPayload) => void
}) {
  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLLIElement>) => {
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(TIMELINE_DRAG_MIME, JSON.stringify(payload))
      // Also expose as text/plain so the browser shows a reasonable drag
      // affordance + so other listeners can read it for free.
      e.dataTransfer.setData('text/plain', label)
    },
    [payload, label],
  )
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDoubleClick={() => onAdd?.(payload)}
      className="group/row flex cursor-grab items-center gap-2 rounded-md border border-white/[0.04] bg-white/[0.02] p-1.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-skinny-yellow/30 hover:bg-white/[0.04] active:cursor-grabbing active:translate-y-0"
      aria-label={`${label} — drag to timeline or double-click to add`}
    >
      <span className="text-white/20 group-hover/row:text-white/50">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      {thumbnail}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[11px] font-medium text-white/90">
          {label}
        </span>
        <span className="text-[10px] tabular-nums text-white/40">{sub}</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onAdd?.(payload)
        }}
        aria-label={`Add ${label} to timeline`}
        className="opacity-0 group-hover/row:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded text-white/50 transition hover:bg-white/[0.06] hover:text-skinny-yellow focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 outline-none"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

// ─── Video thumbnail (live <video> seeked to first frame, no audio) ───────

function VideoThumb({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v || !url) return
    v.muted = true
    v.playsInline = true
    // Seek to t=0.1 to grab a frame past any black leader.
    v.currentTime = 0.1
  }, [url])
  if (!url) {
    return <div className="h-9 w-9 rounded-md bg-white/[0.04]" />
  }
  return (
    <div className="relative h-9 w-9 overflow-hidden rounded-md bg-black ring-1 ring-white/[0.08]">
      <video
        ref={ref}
        src={url}
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  )
}

// ─── Hook: probe media duration ───────────────────────────────────────────

function useMediaDuration(url: string, kind: 'video' | 'audio'): number {
  const [d, setD] = useState(0)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const el = document.createElement(kind === 'video' ? 'video' : 'audio')
    el.preload = 'metadata'
    el.src = url
    function onLoaded() {
      if (cancelled) return
      const dur = Number.isFinite(el.duration) ? el.duration : 0
      setD(dur)
      cleanup()
    }
    function onErr() {
      cleanup()
    }
    function cleanup() {
      el.removeEventListener('loadedmetadata', onLoaded)
      el.removeEventListener('error', onErr)
    }
    el.addEventListener('loadedmetadata', onLoaded)
    el.addEventListener('error', onErr)
    return () => {
      cancelled = true
      cleanup()
    }
  }, [url, kind])
  return d
}
