'use client'

// Tabbed picker for the Director composer's "+ attach" affordance.
//
// Tabs:
//   1. Upload      - drag/drop or click to choose; uploads via /api/upload-image (folder=temp)
//   2. URL         - paste an https:// image URL directly
//   3. Hub         - browse /api/generations (mirrors components/chat/image-source-picker.tsx)
//   4. This canvas - every node in the current canvas with an output (generationHistory[*].urls
//                    or outputUrls). Key affordance for "use my canvas as visual context".
//
// We deliberately mirror the visual language of the existing
// `ImageSourcePicker`, just compressed into a single tabbed surface so the
// composer stays uncluttered (one `+` button instead of three icons).

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  Upload,
  ImageIcon,
  X,
  Search,
  Link2,
  Layers,
  Boxes,
  AlertCircle,
} from 'lucide-react'
import { Canvas, CanvasNode } from '@/lib/canvas/ir'
import { validateImage, fileToBase64 } from '@/lib/image-utils'
import { cn } from '@/lib/utils'
import type { DirectorAttachment } from './AttachmentChips'

type Tab = 'upload' | 'url' | 'hub' | 'canvas'

interface HubGeneration {
  id: string
  prompt: string
  output_urls: string[]
  model_slug: string
  model_category?: string
  /** Persisted Gemini-vision analysis from `/api/analyze-image` (written to
      `generations.output_metadata.analysis` on first analysis). Carrying this
      through the picker lets reference-image nodes skip the re-analyze
      roundtrip — saves Gemini tokens + the user's vision credits when they
      reuse the same hub asset across canvases. */
  output_metadata?: {
    analysis?: { text?: string; purpose?: string; analyzed_at?: string }
  } | null
}

interface AttachmentPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onAttach: (
    attachment: Omit<DirectorAttachment, 'status'> & { status?: DirectorAttachment['status'] },
  ) => void
  /** Number of slots remaining; the modal disables selection past this. */
  remainingSlots: number
  /** For the "This canvas" tab. */
  canvas: Canvas
  /** Whop auth header builder, mirrors the rest of the codebase. */
  getHeaders: () => Record<string, string>
  /** Optional default tab; defaults to 'upload'. */
  initialTab?: Tab
}

export function AttachmentPickerModal({
  isOpen,
  onClose,
  onAttach,
  remainingSlots,
  canvas,
  getHeaders,
  initialTab = 'upload',
}: AttachmentPickerModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [generations, setGenerations] = useState<HubGeneration[] | null>(null)
  const [hubLoading, setHubLoading] = useState(false)
  const [hubError, setHubError] = useState<string | null>(null)
  const [hubQuery, setHubQuery] = useState('')
  const [hubReloadKey, setHubReloadKey] = useState(0)

  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Reset transient state when reopened.
  useEffect(() => {
    if (isOpen) {
      setTab(initialTab)
      setUrlInput('')
      setUrlError(null)
      setUploadError(null)
      setHubQuery('')
    }
  }, [isOpen, initialTab])

  // Esc closes; lock body scroll while open so the page behind doesn't
  // drift when the user spins the mouse wheel in the picker.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  // Lazy-load Hub generations on first switch to that tab.
  useEffect(() => {
    if (!isOpen || tab !== 'hub') return
    // Skip if already loaded, unless caller bumped the reload key.
    if (generations !== null && hubReloadKey === 0) return
    if (hubLoading) return
    setHubLoading(true)
    setHubError(null)
    fetch('/api/generations?category=image&limit=50', { headers: getHeaders() })
      .then(async (r) => {
        if (r.status === 401) throw new Error('sign in to access your Skinny Hub')
        if (!r.ok) throw new Error(`couldn't load your library (${r.status})`)
        return r.json()
      })
      .then((data) => setGenerations(data?.generations || []))
      .catch((err) => setHubError(err?.message || "couldn't load your library"))
      .finally(() => setHubLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, hubReloadKey])

  /* ===== Upload tab ==================================================== */

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null)
      const arr = Array.from(files)
      let usedSlots = 0
      for (const file of arr) {
        if (usedSlots >= remainingSlots) break
        const validation = validateImage(file)
        if (!validation.valid) {
          setUploadError(validation.error || 'Invalid image')
          continue
        }

        // Optimistically attach with the local object URL while we upload.
        const localUrl = URL.createObjectURL(file)
        const tempId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        onAttach({
          id: tempId,
          url: localUrl,
          kind: 'image',
          name: file.name,
          source: 'upload',
          status: 'uploading',
        })
        usedSlots += 1

        // Fire-and-forget upload; CreativeDirectorChat patches the chip
        // when it sees a matching id (status -> 'ready', url -> https).
        try {
          const base64DataUrl = await fileToBase64(file)
          const base64 = base64DataUrl.split(',')[1]
          const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              base64,
              mimeType: file.type,
              filename: file.name,
              folder: 'temp',
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data?.error || `Upload failed (${res.status})`)
          }
          const data = await res.json()
          if (!data?.url) throw new Error('Upload returned no URL')
          onAttach({
            id: tempId,
            url: data.url,
            kind: 'image',
            name: file.name,
            source: 'upload',
            status: 'ready',
          })
        } catch (err: any) {
          onAttach({
            id: tempId,
            url: localUrl,
            kind: 'image',
            name: file.name,
            source: 'upload',
            status: 'error',
            error: err?.message || 'Upload failed',
          })
          setUploadError(err?.message || 'Upload failed')
        } finally {
          // Don't revoke immediately — the chip is now using the http URL,
          // but if upload failed we keep the object URL alive for preview.
          // Browser will GC on tab close; cheap enough.
        }
      }
      if (usedSlots > 0) onClose()
    },
    [remainingSlots, onAttach, onClose, getHeaders],
  )

  const onPickFile = () => fileInputRef.current?.click()
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void handleFiles(e.target.files)
    e.target.value = ''
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files)
  }

  /* ===== URL tab ======================================================= */

  const submitUrl = () => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      setUrlError("that doesn't look like a URL — try a full https:// link")
      return
    }
    if (parsed.protocol !== 'https:') {
      setUrlError('use an https:// URL — models can\'t fetch insecure http')
      return
    }
    onAttach({
      id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: trimmed,
      kind: 'image',
      name: parsed.pathname.split('/').pop() || trimmed,
      source: 'url',
      status: 'ready',
    })
    setUrlInput('')
    setUrlError(null)
    onClose()
  }

  /* ===== Hub tab ======================================================= */

  const filteredGenerations = (generations ?? []).filter((g) => {
    if (!hubQuery) return true
    const q = hubQuery.toLowerCase()
    return (
      g.prompt?.toLowerCase().includes(q) ||
      g.model_slug?.toLowerCase().includes(q)
    )
  })

  const attachFromHub = (gen: HubGeneration, url: string) => {
    // Carry the persisted vision analysis through so downstream nodes
    // don't re-burn Gemini credits on the same asset.
    const cachedAnalysis = gen.output_metadata?.analysis?.text
    onAttach({
      id: `hub_${gen.id}_${Date.now()}`,
      url,
      kind: 'image',
      name: gen.prompt?.slice(0, 40) || 'Hub image',
      source: 'hub',
      status: 'ready',
      visionContext: cachedAnalysis || undefined,
    })
    onClose()
  }

  /* ===== Canvas tab ==================================================== */

  // Collect every output URL across the current canvas (latest history
  // entry first, falling back to outputUrls for nodes that haven't been
  // re-run yet). Skip the orchestrator/output nodes since they don't
  // produce visual outputs themselves.
  type CanvasOutput = {
    nodeId: string
    nodeType: string
    nodeTitle: string
    url: string
    kind: 'image' | 'video'
    visionContext?: string
  }
  const canvasOutputs: CanvasOutput[] = []
  for (const node of canvas.nodes) {
    const kind: 'image' | 'video' = node.type === 'video-gen' ? 'video' : 'image'
    const nodeVision = (node.data as any).visionContext as string | undefined
    const collect = (urls: string[] | undefined) => {
      if (!urls?.length) return
      for (const url of urls) {
        if (!url) continue
        canvasOutputs.push({
          nodeId: node.id,
          nodeType: node.type,
          nodeTitle: node.data.title || node.data.modelName || node.type,
          url,
          kind,
          visionContext: nodeVision,
        })
      }
    }
    // Static reference-image nodes also count.
    if (node.type === 'reference-image' && node.data.imageUrl) {
      canvasOutputs.push({
        nodeId: node.id,
        nodeType: node.type,
        nodeTitle: node.data.title || 'Reference',
        url: node.data.imageUrl,
        kind: 'image',
        visionContext: nodeVision,
      })
    }
    if (node.data.generationHistory?.length) {
      // Latest entry only — that matches what the node displays by default.
      collect(node.data.generationHistory[0]?.urls)
    } else {
      collect(node.data.outputUrls)
    }
  }
  // De-dupe by URL (a fan-out can push the same URL to multiple nodes).
  const seenUrls = new Set<string>()
  const dedupedCanvasOutputs = canvasOutputs.filter((o) => {
    if (seenUrls.has(o.url)) return false
    seenUrls.add(o.url)
    return true
  })

  const attachFromCanvas = (out: CanvasOutput) => {
    onAttach({
      id: `canvas_${out.nodeId}_${Date.now()}`,
      url: out.url,
      kind: out.kind,
      name: `${out.nodeTitle} · ${out.nodeId.slice(0, 4)}`,
      source: 'canvas',
      fromNodeId: out.nodeId,
      status: 'ready',
      visionContext: out.visionContext,
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-picker-title"
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-xl max-h-[85vh] sm:max-h-[80vh] flex flex-col bg-zinc-950 rounded-2xl ring-1 ring-white/[0.08] shadow-2xl overflow-hidden"
        >
          {/* ===== Header / tabs ============================================ */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
            <h3 id="attachment-picker-title" className="text-sm font-medium text-white">
              add a reference
            </h3>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close (Esc)"
              title="close (Esc)"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Attachment source"
            className="px-3 pt-2 flex items-center gap-1 border-b border-white/[0.05] shrink-0 overflow-x-auto"
          >
            <TabBtn active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload size={12} />}>upload</TabBtn>
            <TabBtn active={tab === 'url'} onClick={() => setTab('url')} icon={<Link2 size={12} />}>URL</TabBtn>
            <TabBtn active={tab === 'hub'} onClick={() => setTab('hub')} icon={<ImageIcon size={12} />}>skinny hub</TabBtn>
            <TabBtn active={tab === 'canvas'} onClick={() => setTab('canvas')} icon={<Boxes size={12} />}>
              this canvas
              <span className="ml-1 text-[9px] text-zinc-500">({dedupedCanvasOutputs.length})</span>
            </TabBtn>
          </div>

          {remainingSlots <= 0 && (
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-200">
              attachment limit reached — remove one to add another.
            </div>
          )}

          {/* ===== Tab body ================================================= */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'upload' && (
              <div className="p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={onFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={onPickFile}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  disabled={remainingSlots <= 0}
                  className={cn(
                    'w-full rounded-xl border-2 border-dashed py-12 px-6 flex flex-col items-center gap-2 transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
                    isDragging
                      ? 'border-skinny-yellow/70 bg-skinny-yellow/10 scale-[1.01]'
                      : 'border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.2]',
                    remainingSlots <= 0 && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className={cn(
                    'h-11 w-11 rounded-xl flex items-center justify-center transition-colors',
                    isDragging
                      ? 'bg-skinny-yellow/20 ring-1 ring-skinny-yellow/40'
                      : 'bg-white/[0.04] ring-1 ring-white/[0.08]',
                  )}>
                    <Upload size={18} className={isDragging ? 'text-skinny-yellow' : 'text-zinc-400'} aria-hidden="true" />
                  </div>
                  <div className="text-sm text-white">
                    {isDragging ? 'drop to attach' : 'drop an image or click to browse'}
                  </div>
                  <div className="text-[11px] text-zinc-500">JPEG, PNG, WebP, or GIF · up to 10MB · {remainingSlots} slot{remainingSlots === 1 ? '' : 's'} left</div>
                </button>
                {uploadError && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/20 text-rose-200 text-[11px]"
                  >
                    <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="flex-1 leading-relaxed">{uploadError}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadError(null)
                        onPickFile()
                      }}
                      className="shrink-0 underline-offset-2 hover:underline text-rose-100 focus-visible:outline-none focus-visible:underline"
                    >
                      try again
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab === 'url' && (
              <div className="p-4 space-y-3">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">image URL</span>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://…/image.jpg"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value)
                      setUrlError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        submitUrl()
                      }
                    }}
                    autoFocus
                    aria-invalid={!!urlError}
                    aria-describedby={urlError ? 'url-error' : 'url-hint'}
                    className={cn(
                      'mt-1.5 w-full bg-white/[0.03] ring-1 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600',
                      'focus:outline-none focus:ring-2 transition-colors',
                      urlError
                        ? 'ring-rose-500/50 focus:ring-rose-500/60'
                        : 'ring-white/[0.08] focus:ring-skinny-yellow/50',
                    )}
                  />
                </label>
                {urlError && (
                  <div id="url-error" role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-300">
                    <AlertCircle size={11} className="mt-[2px] shrink-0" aria-hidden="true" />
                    <span>{urlError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={submitUrl}
                  disabled={!urlInput.trim() || remainingSlots <= 0}
                  className={cn(
                    'w-full h-9 px-3 rounded-md text-[12px] font-semibold transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                    urlInput.trim() && remainingSlots > 0
                      ? 'bg-skinny-yellow text-black hover:brightness-110 active:brightness-95'
                      : 'bg-white/[0.04] text-zinc-500 cursor-not-allowed',
                  )}
                >
                  attach URL
                </button>
                <p id="url-hint" className="text-[10px] text-zinc-500 leading-relaxed">
                  must be https:// and publicly reachable. the Director sees the image directly when the model supports vision.
                </p>
              </div>
            )}

            {tab === 'hub' && (
              <div className="flex flex-col h-full">
                <div className="p-3 border-b border-white/[0.05]">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                    <input
                      type="search"
                      value={hubQuery}
                      onChange={(e) => setHubQuery(e.target.value)}
                      placeholder="search your generations…"
                      aria-label="Search hub generations"
                      className="w-full pl-8 pr-3 py-1.5 bg-white/[0.03] ring-1 ring-white/[0.06] rounded-md text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-skinny-yellow/40 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 min-h-0">
                  {hubLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" aria-busy="true">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="aspect-square rounded-md bg-white/[0.03] ring-1 ring-white/[0.04] animate-pulse"
                        />
                      ))}
                    </div>
                  ) : hubError ? (
                    <div role="alert" className="text-center py-12">
                      <AlertCircle size={20} className="mx-auto text-rose-400 mb-2" aria-hidden="true" />
                      <p className="text-rose-300/90 text-[12px] mb-3">{hubError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setGenerations(null)
                          setHubReloadKey((k) => k + 1)
                        }}
                        className="text-[11px] px-3 py-1 rounded-md bg-white/[0.05] ring-1 ring-white/[0.08] text-zinc-200 hover:bg-white/[0.08] hover:ring-skinny-yellow/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors"
                      >
                        try again
                      </button>
                    </div>
                  ) : filteredGenerations.length === 0 ? (
                    <div className="text-center py-12">
                      <ImageIcon size={28} className="mx-auto text-zinc-700 mb-2" aria-hidden="true" />
                      <p className="text-zinc-400 text-[12px]">
                        {hubQuery ? `no matches for "${hubQuery}"` : 'no generations yet'}
                      </p>
                      {!hubQuery && (
                        <p className="text-zinc-600 text-[11px] mt-1.5 leading-relaxed">
                          run a node to start filling your hub.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {filteredGenerations.flatMap((gen) =>
                        (gen.output_urls || []).map((url, i) => (
                          <button
                            key={`${gen.id}-${i}`}
                            type="button"
                            onClick={() => attachFromHub(gen, url)}
                            disabled={remainingSlots <= 0}
                            title={gen.prompt || 'Hub image'}
                            className="group relative aspect-square rounded-md overflow-hidden bg-white/[0.03] ring-1 ring-white/[0.04] hover:ring-skinny-yellow/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={gen.prompt?.slice(0, 80) || 'Hub image'}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            {gen.model_slug && (
                              <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-sm bg-black/70 backdrop-blur-sm text-[8px] uppercase tracking-wide text-zinc-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                {gen.model_slug.split('/').pop()?.slice(0, 12) || gen.model_slug}
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="text-[9px] text-white/90 line-clamp-2 leading-tight">
                                {gen.prompt?.slice(0, 60) || 'untitled'}
                              </p>
                            </div>
                          </button>
                        )),
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'canvas' && (
              <div className="p-3">
                {dedupedCanvasOutputs.length === 0 ? (
                  <div className="text-center py-12">
                    <Layers size={28} className="mx-auto text-zinc-700 mb-2" aria-hidden="true" />
                    <p className="text-zinc-400 text-[12px]">no outputs on this canvas yet</p>
                    <p className="text-zinc-600 text-[11px] mt-1.5 leading-relaxed max-w-[28ch] mx-auto">
                      run a node first — then come back to reuse its output as a reference.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {dedupedCanvasOutputs.map((out, i) => (
                      <button
                        key={`${out.nodeId}-${i}`}
                        type="button"
                        onClick={() => attachFromCanvas(out)}
                        disabled={remainingSlots <= 0}
                        className="group relative aspect-square rounded-md overflow-hidden bg-white/[0.03] ring-1 ring-white/[0.04] hover:ring-skinny-yellow/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title={`${out.nodeTitle} (${out.nodeId.slice(0, 4)})`}
                        aria-label={`Attach ${out.nodeTitle} from canvas`}
                      >
                        {out.kind === 'video' ? (
                          <div className="h-full w-full flex items-center justify-center bg-zinc-800 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                            video
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={out.url}
                            alt={out.nodeTitle}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                        {/* Source pill — node type + short id, so the user can
                            distinguish two outputs from the same model. */}
                        <div className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/75 backdrop-blur-sm flex items-center justify-between gap-1 text-[8px] uppercase tracking-wider text-skinny-yellow font-bold leading-none">
                          <span className="truncate">{out.nodeType}</span>
                          <span className="text-zinc-500 font-mono">{out.nodeId.slice(0, 4)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors -mb-px border-b-2 whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/40 focus-visible:rounded-t-md',
        active
          ? 'text-white border-skinny-yellow'
          : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:border-white/[0.1]',
      )}
    >
      <span className={active ? 'text-skinny-yellow' : ''} aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </button>
  )
}
