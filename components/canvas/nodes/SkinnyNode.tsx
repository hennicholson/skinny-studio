'use client'

// Runway-style node: compact dark card with colored handle pills hanging off
// the left and right edges. The handle itself IS the pill — react-flow lets
// us render arbitrary children inside Handle, so we use it as the connection
// hit target AND the visible affordance.
//
// State language (intentional, not loading):
//   idle/queued  → ring-1 white/[0.06]
//   hover        → ring-1 white/[0.14] + lift shadow
//   selected     → double-stroke skinny-yellow with soft halo
//   running      → animated conic-gradient border trace (edge shimmer)
//   done         → bottom-edge emerald accent + thumbnail (no corner dot)
//   error        → muted rose ring + inline micro-message slot

import { memo, useCallback, useState } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { AlertCircle, Play, Loader2, Square, ChevronLeft, ChevronRight } from 'lucide-react'
import { NODE_TYPES, NodeType, NodeStatus, HandleType, HandleDef } from '@/lib/canvas/ir'
import { colorFor } from '../handle-colors'
import { useCanvasActions } from '@/lib/canvas/canvas-actions'
import { validateImage, fileToBase64 } from '@/lib/image-utils'
import { analyzeReferenceImage } from '@/lib/canvas/vision'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'

const NODE_WIDTH = 168
// Vertical rhythm for handle pills. We compress the gap and shrink the
// base offset when the side has >3 handles so the video-gen node (4 input
// pills) never overflows the card height.
const HANDLE_VERTICAL_GAP_DEFAULT = 22
const HANDLE_VERTICAL_GAP_DENSE = 18
const HANDLE_BASE_OFFSET_DEFAULT = 36
const HANDLE_BASE_OFFSET_DENSE = 28

function handleLayout(count: number) {
  const dense = count >= 4
  return {
    gap: dense ? HANDLE_VERTICAL_GAP_DENSE : HANDLE_VERTICAL_GAP_DEFAULT,
    base: dense ? HANDLE_BASE_OFFSET_DENSE : HANDLE_BASE_OFFSET_DEFAULT,
    dense,
  }
}

interface SkinnyNodeData {
  status: NodeStatus
  title?: string
  modelSlug?: string
  modelName?: string
  prompt?: string
  imageUrl?: string
  outputUrls?: string[]
  error?: string
  costCents?: number
  variations?: number
  nodeType: NodeType
}

function SkinnyNodeBase({ id, data, selected }: NodeProps<any>) {
  const nodeType = (data.nodeType as NodeType) || 'text-prompt'
  const def = NODE_TYPES[nodeType]
  const status: NodeStatus = data.status || 'idle'
  const actions = useCanvasActions()
  // Only model nodes can be run individually. Other types are inputs / outputs
  // / utilities — they have no remote work to fire by themselves.
  // Nodes that can be invoked individually via their own Run button (executor
  // still walks ancestors). image-gen / video-gen call Replicate; orchestrator
  // and production-brief call the Director LLM. Data-only nodes (text-prompt,
  // entity, reference-image, skill, fan-out, output) don't have side effects
  // worth running solo.
  const canRunSolo =
    nodeType === 'image-gen' ||
    nodeType === 'video-gen' ||
    nodeType === 'orchestrator' ||
    nodeType === 'production-brief'

  const isMedia =
    nodeType === 'image-gen' ||
    nodeType === 'video-gen' ||
    nodeType === 'reference-image' ||
    nodeType === 'output' ||
    nodeType === 'fan-out' ||
    // Entity nodes show their reference image as the body when one is bound.
    // Falls back to TextBody (showing the entity name) when unset.
    (nodeType === 'entity' && !!data.imageUrl)

  const inLayout = handleLayout(def.inputs.length)
  const outLayout = handleLayout(def.outputs.length)

  // Per-node OS file-drop state. Only applies to empty reference-image nodes;
  // a populated node lets the file event bubble to CanvasShell which spawns
  // a brand-new reference node from the dropped file. This keeps the gesture
  // safe — you can't silently overwrite an attached image.
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const isEmptyRefNode = nodeType === 'reference-image' && !data.imageUrl

  // Ring/shadow recipe per state. We avoid layout-shifting properties so the
  // node stays perfectly anchored in flow coordinates — only outlines, shadows
  // and a 1px transform-y on hover (negligible, doesn't move handle origins
  // because react-flow positions handles relative to the node element).
  const ringClasses = (() => {
    // File drag hovering an empty ref node trumps the other states visually
    // so the user reads it as "yes, drop here".
    if (isDragOver && isEmptyRefNode) {
      return 'ring-2 ring-skinny-yellow/70 shadow-[0_0_0_4px_rgba(214,252,81,0.18),0_8px_28px_-10px_rgba(214,252,81,0.45)]'
    }
    if (status === 'error') {
      return 'ring-1 ring-rose-500/40 shadow-[0_0_0_3px_rgba(244,63,94,0.05),0_8px_24px_-12px_rgba(244,63,94,0.25)]'
    }
    if (selected) {
      return 'ring-2 ring-skinny-yellow/70 shadow-[0_0_0_4px_rgba(214,252,81,0.08),0_8px_28px_-10px_rgba(214,252,81,0.35)]'
    }
    return 'ring-1 ring-white/[0.06] hover:ring-white/[0.14] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]'
  })()

  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ y: -1 }}
      transition={{ y: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
      className={`group relative rounded-2xl bg-zinc-900/95 backdrop-blur-sm overflow-visible cursor-pointer transition-[box-shadow,outline-color] duration-200 ${ringClasses}`}
      style={{ width: NODE_WIDTH }}
    >
      {/* Running-state edge trace — conic gradient masked to a 1.5px border.
          Sits behind the node body via z-0 but above the card bg via the
          mask-composite trick. Uses skinny-yellow as the bright tracer. */}
      {status === 'running' && <RunningTrace />}

      {/* Body */}
      {isMedia ? (
        <MediaBody
          data={data}
          nodeType={nodeType}
          nodeId={id}
          isDragOver={isDragOver}
          isUploading={isUploading}
          setIsDragOver={setIsDragOver}
          setIsUploading={setIsUploading}
        />
      ) : (
        <TextBody data={data} nodeType={nodeType} />
      )}

      {/* Footer label strip — title + model slug + per-node Run button.
          Per-node Run is the small play affordance unique to model nodes;
          it kicks off this node + all its upstream ancestors via the
          CanvasActions context. Hidden when no actions provider (e.g. in
          static previews). */}
      <div className="relative px-3 py-2 border-t border-white/[0.05] flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-400 truncate font-medium min-w-0 flex-1">
          {data.title || data.modelName || def.label}
        </span>
        {canRunSolo && (data.modelSlug || (data as any).targetModel) && (
          <span className="text-[9px] text-zinc-600 font-mono truncate min-w-0">
            {data.modelSlug || (data as any).targetModel}
          </span>
        )}
        {canRunSolo && actions && (
          <NodeRunButton
            nodeId={id}
            isRunning={status === 'running'}
            globallyRunning={actions.isRunning}
            onRun={() => actions.runFromNode(id)}
            onStop={() => actions.stopRun()}
          />
        )}
      </div>

      {/* Done-state bottom-edge accent — a 1.5px lime underline replaces the
          old corner dot. Reads as "this completed" without competing with the
          status of upstream/downstream nodes. */}
      {status === 'done' && (
        <div className="pointer-events-none absolute left-3 right-3 bottom-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent" />
      )}

      {/* Error micro-message slot — fits under the body without resizing the
          card width. line-clamp keeps long errors from blowing out layout. */}
      {status === 'error' && data.error && (
        <div
          className="px-3 pb-2 -mt-1 flex items-start gap-1.5"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle size={10} className="text-rose-400/90 mt-[2px] flex-shrink-0" aria-hidden />
          <span className="text-[9.5px] leading-tight text-rose-300/90 line-clamp-2">
            {data.error}
          </span>
        </div>
      )}

      {/* Input handle pills (left) */}
      {def.inputs.map((h, i) => (
        <HandlePill
          key={`in:${h.id}`}
          handleDef={h}
          side="left"
          offsetY={inLayout.base + i * inLayout.gap}
          dense={inLayout.dense}
        />
      ))}

      {/* Output handle pills (right) */}
      {def.outputs.map((h, i) => (
        <HandlePill
          key={`out:${h.id}`}
          handleDef={h}
          side="right"
          offsetY={outLayout.base + i * outLayout.gap}
          dense={outLayout.dense}
        />
      ))}
    </motion.div>
  )
}

function HandlePill({
  handleDef,
  side,
  offsetY,
  dense,
}: {
  handleDef: HandleDef
  side: 'left' | 'right'
  offsetY: number
  dense: boolean
}) {
  const c = colorFor(handleDef.type as HandleType)
  const isOutput = side === 'right'
  const required = !isOutput && !handleDef.multi && handleDef.type !== 'any'

  // Two-element pattern: the Handle is the connection point (a small colored
  // dot at the node edge — no transform, so react-flow can compute edge
  // endpoints reliably). The Pill is a decorative label that sits OUTSIDE
  // the node via transform-only positioning.
  //
  // The Handle dot gets a colored box-shadow halo so users see the snap zone
  // when they approach it with a dragging edge. Activated via :hover scale
  // (already 1.4x in globals.css) — the halo is always on, just subtle.
  const haloShadow = `0 0 0 4px ${c.glow.replace('0.55', '0.0')}, 0 0 8px ${c.glow.replace('0.55', '0.35')}`

  return (
    <>
      <Handle
        id={handleDef.id}
        type={isOutput ? 'source' : 'target'}
        position={isOutput ? Position.Right : Position.Left}
        isConnectable
        title={`${handleDef.label} · ${c.typeLabel}${required ? ' (required)' : ''}${handleDef.multi ? ' (accepts multiple)' : ''}`}
        style={{
          top: offsetY,
          width: 8,
          height: 8,
          background: c.stroke,
          border: '2px solid #18181b',
          boxShadow: haloShadow,
          transition: 'box-shadow 160ms ease, transform 160ms ease',
          [isOutput ? 'right' : 'left']: -4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: offsetY,
          [isOutput ? 'right' : 'left']: -7,
          transform: isOutput ? 'translate(100%, -50%)' : 'translate(-100%, -50%)',
          pointerEvents: 'none',
        }}
        // Required pills get a touch more opacity and an inset white dot so
        // they read as "must connect" at a glance — without changing color
        // family (which is reserved for handle TYPE).
        className={`px-1.5 ${dense ? 'py-[2px]' : 'py-[3px]'} rounded-[5px] text-[9px] font-bold uppercase tracking-wide ${c.bg} ${c.text} shadow-md whitespace-nowrap inline-flex items-center gap-1 ${required ? '' : 'opacity-[0.92]'}`}
        title={`${handleDef.label} · ${c.typeLabel}`}
      >
        {required && (
          <span
            aria-hidden
            className="inline-block w-[3px] h-[3px] rounded-full bg-current opacity-90"
          />
        )}
        {handleDef.label}
      </div>
    </>
  )
}

// Running-state edge trace. A conic-gradient layer rotates *inside* a
// rounded mask wrapper, so the bright arc sweeps around the node edge.
// Reads as "active processing" without the loading-spinner cliché.
//
// Anatomy:
//   .wrapper   absolute -inset-px, masked to a 1.5px ring via mask-composite.
//              Stays fixed-shape (matches parent's rounded-2xl).
//   .spinner   2x oversized child, rotates 360° on a 2.4s linear loop. The
//              conic gradient lives here. Oversizing ensures the bright arc
//              always reaches the corners during rotation.
function RunningTrace() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-px rounded-2xl overflow-hidden"
      style={{
        WebkitMask:
          'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        WebkitMaskComposite: 'xor',
        mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        maskComposite: 'exclude',
        padding: '1.5px',
        zIndex: 0,
      }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, ease: 'linear', repeat: Infinity }}
        className="absolute"
        style={{
          // Oversize + center so the rotation traces a clean square circuit.
          inset: '-50%',
          width: '200%',
          height: '200%',
          background:
            'conic-gradient(from 0deg, rgba(214,252,81,0) 0deg, rgba(214,252,81,0.95) 40deg, rgba(214,252,81,0) 120deg, rgba(214,252,81,0) 360deg)',
        }}
      />
    </div>
  )
}

function MediaBody({
  data,
  nodeType,
  nodeId,
  isDragOver,
  isUploading,
  setIsDragOver,
  setIsUploading,
}: {
  data: SkinnyNodeData
  nodeType: NodeType
  nodeId: string
  isDragOver: boolean
  isUploading: boolean
  setIsDragOver: (v: boolean) => void
  setIsUploading: (v: boolean) => void
}) {
  const actions = useCanvasActions()
  const getHeaders = useWhopHeaders()
  const history = (data as any).generationHistory as
    | Array<{ urls: string[]; label?: string; completedAt: string }>
    | undefined
  const historyIndex = (data as any).historyIndex ?? 0
  const totalRuns = history?.length ?? 0
  const currentEntry = history && totalRuns > 0 ? history[historyIndex] : undefined

  // Resolve the URLs to show. Priority: current history entry → live
  // outputUrls (legacy / not-yet-persisted) → static imageUrl (reference node).
  const urls = currentEntry?.urls || data.outputUrls || (data.imageUrl ? [data.imageUrl] : [])
  const isVideo =
    nodeType === 'video-gen' || (urls[0]?.match(/\.(mp4|webm|mov)(\?|$)/i) ? true : false)
  const hasContent = urls.length > 0
  const showPagination = totalRuns > 1 && (nodeType === 'image-gen' || nodeType === 'video-gen')

  // ---------------------------------------------------------------------
  // Per-node OS file drop (reference-image only, only when empty).
  //
  // Why a per-node handler in addition to the canvas-wide one:
  //   The canvas-wide drop spawns a NEW reference node at the cursor
  //   position. If a user is dragging onto an already-existing empty
  //   reference node — the obvious "fill this slot" gesture — they expect
  //   the file to attach in-place, not create a duplicate node next to
  //   it. So this handler intercepts (preventDefault + stopPropagation)
  //   the drop before it reaches CanvasShell.
  //
  // We gate on:
  //   - nodeType === 'reference-image'    (other types ignore file drops here)
  //   - !data.imageUrl                    (don't silently overwrite an attached image —
  //                                        the canvas-wide handler will create a new node instead)
  //   - dataTransfer.types includes 'Files' (filters out React Flow's own
  //                                          internal drags, which use different mime types)
  //
  // Lifecycle: validate → upload to /api/upload-image (folder='hub' for
  // permanence) → patch the node's imageUrl + filename title → kick off
  // analyzeReferenceImage in the background (the result lands on
  // visionContext so the Director can SEE the image, not just the URL).
  // ---------------------------------------------------------------------
  // Local copy of the same predicate used in SkinnyNodeBase. Kept inline
  // (rather than threaded through props) so MediaBody is self-contained for
  // its own visual treatment + drop-handler gating.
  const isEmptyRefNode = nodeType === 'reference-image' && !data.imageUrl
  const canAcceptDrop = isEmptyRefNode && !isUploading

  // Accept either an OS file drop ('Files') OR a canvas-internal asset drag
  // ('application/skinny-asset-url' — set by another SkinnyNode when the user
  // drags an image OUT of a generation result). React Flow's node-drag uses
  // its own mime types (e.g. 'application/reactflow') so we deliberately don't
  // accept those here — that would hijack node rearrangement.
  const acceptsThisDrag = useCallback((e: React.DragEvent): 'file' | 'asset' | null => {
    const types = Array.from(e.dataTransfer.types)
    if (types.includes('Files')) return 'file'
    if (types.includes('application/skinny-asset-url')) return 'asset'
    return null
  }, [])
  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return
      if (!acceptsThisDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(true)
    },
    [canAcceptDrop, acceptsThisDrag, setIsDragOver],
  )
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return
      if (!acceptsThisDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    },
    [canAcceptDrop, acceptsThisDrag],
  )
  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only clear the highlight when leaving the node entirely. Without
      // this, dragging across child elements (the placeholder text,
      // emoji icon, etc.) would flicker the highlight off + on.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setIsDragOver(false)
    },
    [setIsDragOver],
  )
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!canAcceptDrop) return

      // ---- Path A: canvas-internal asset drag (already an HTTPS URL) ----
      // User dragged an image OUT of another node's output and dropped it
      // here. No upload needed — the URL is already on Skinny Hub. Just
      // attach it + fire vision analysis (which has its own three-layer
      // cache; if this URL was already analyzed elsewhere it returns
      // instantly without re-billing Gemini).
      const internalUrl = e.dataTransfer.getData('application/skinny-asset-url')
      if (internalUrl) {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
        const patch: Record<string, any> = {
          imageUrl: internalUrl,
          visionContext: undefined, // re-analyze for the new ref slot
        }
        if (!data.title) {
          // Pull a friendly title off the source if it carried one.
          const srcKind = e.dataTransfer.getData('application/skinny-asset-kind') || 'image'
          patch.title = `From canvas (${srcKind})`
        }
        actions?.updateNode(nodeId, patch)
        analyzeReferenceImage(internalUrl, { getHeaders })
          .then((r) => {
            if (r.ok && r.analysis) {
              actions?.updateNode(nodeId, { visionContext: r.analysis })
            }
          })
          .catch(() => {})
        return
      }

      // ---- Path B: OS file drop (needs upload) ----
      const files = Array.from(e.dataTransfer.files || [])
      const imageFile = files.find((f) => f.type.startsWith('image/'))
      if (!imageFile) {
        // Non-image dropped (e.g. PDF, plain text). Don't error-spam — just
        // clear the highlight and let it fall through. The canvas-wide
        // handler also won't do anything useful with it.
        setIsDragOver(false)
        return
      }
      // We have a real image — claim the event so CanvasShell doesn't ALSO
      // spawn a duplicate node from the same drop.
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const validation = validateImage(imageFile)
      if (!validation.valid) {
        // Surface to the user — toast lives in CanvasShell, but a console
        // warn keeps debug visibility; we don't want to depend on toast
        // here to keep the node renderer self-contained.
        console.warn('[SkinnyNode] image dropped on node failed validation:', validation.error)
        return
      }

      setIsUploading(true)
      try {
        const dataUrl = await fileToBase64(imageFile)
        // fileToBase64 in lib/image-utils returns the full data URL (with the
        // `data:<mime>;base64,` prefix). The upload endpoint expects raw
        // base64, so strip the prefix here.
        const commaIdx = dataUrl.indexOf(',')
        const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl

        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            base64,
            mimeType: imageFile.type,
            filename: imageFile.name,
            folder: 'hub', // permanent — canvas references should persist
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.url) {
          throw new Error(json?.error || `HTTP ${res.status}`)
        }

        // Patch imageUrl + (only if blank) the title. We don't overwrite a
        // user-set title — they may have already labelled the slot.
        const patch: Record<string, any> = {
          imageUrl: json.url,
          // Reset visionContext on new image so the analyzer re-runs fresh.
          visionContext: undefined,
        }
        if (!data.title) patch.title = imageFile.name
        actions?.updateNode(nodeId, patch)

        // Kick off vision analysis in the background. Result lands on
        // visionContext via a second updateNode patch — the Director chat
        // then reads it from the canvas IR on its next turn.
        analyzeReferenceImage(json.url, { getHeaders })
          .then((r) => {
            if (r.ok && r.analysis) {
              actions?.updateNode(nodeId, { visionContext: r.analysis })
            }
          })
          .catch(() => {
            // Silent — the URL still works as a ref even without vision.
          })
      } catch (err) {
        console.error('[SkinnyNode] drop-upload failed:', err)
      } finally {
        setIsUploading(false)
      }
    },
    [canAcceptDrop, getHeaders, actions, nodeId, data.title, setIsDragOver, setIsUploading],
  )

  const cycle = (delta: number, e: React.MouseEvent) => {
    e.stopPropagation()
    actions?.cycleGeneration(nodeId, delta)
  }

  // Drag-out: when a generated image is dragged out of the node onto the
  // canvas pane, CanvasShell's onDrop spawns a reference-image node
  // pre-filled with the URL. This turns "I made an image" into "I made a
  // reusable canvas element I can wire into another node" with one gesture.
  // We also set the URL on `text/uri-list` so dragging into Library / Hub /
  // an external app (Slack, Figma) still works.
  const onMediaDragStart = (e: React.DragEvent) => {
    const url = urls[0]
    if (!url) return
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/skinny-asset-url', url)
    e.dataTransfer.setData(
      'application/skinny-asset-kind',
      isVideo ? 'video' : 'image',
    )
    e.dataTransfer.setData('text/uri-list', url)
    e.dataTransfer.setData('text/plain', url)
    // Stop the drag from also moving the node — react-flow listens for
    // pointer drags on .react-flow__node and the `draggable` attribute
    // triggers the HTML5 drag api which is a separate event stream.
    e.stopPropagation()
  }

  return (
    <div
      className={`relative aspect-square bg-zinc-950 rounded-t-2xl overflow-hidden transition-colors ${
        isDragOver && isEmptyRefNode ? 'bg-skinny-yellow/[0.06]' : ''
      }`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {hasContent ? (
        isVideo && urls[0] ? (
          <video
            src={urls[0]}
            className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
            muted
            loop
            autoPlay
            playsInline
            draggable
            onDragStart={onMediaDragStart}
            title="Drag to canvas to reuse"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urls[0]}
            alt={currentEntry?.label || 'Generated output'}
            className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            draggable
            onDragStart={onMediaDragStart}
            title="Drag to canvas to reuse"
          />
        )
      ) : (
        <div
          className={`w-full h-full flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-wider transition-colors ${
            isDragOver && isEmptyRefNode
              ? 'text-skinny-yellow'
              : 'text-zinc-600'
          }`}
        >
          {isUploading && isEmptyRefNode ? (
            <>
              <Loader2 size={14} className="text-skinny-yellow animate-spin" aria-hidden />
              <span className="text-skinny-yellow/90">uploading…</span>
            </>
          ) : isDragOver && isEmptyRefNode ? (
            <span className="text-skinny-yellow font-semibold tracking-wide">drop to attach</span>
          ) : nodeType === 'fan-out' ? (
            // Fan-out empty state: show the configured variation count as a
            // bold badge so users see at-a-glance how many parallel runs the
            // node will spawn before they wire it up. Once the run completes,
            // outputUrls populates and the regular grid/image preview takes
            // over above.
            <div className="flex flex-col items-center gap-1">
              <span className="text-[20px] font-display text-skinny-yellow font-semibold tabular-nums leading-none">
                ×{Math.max(1, Math.min(8, (data as any).variations ?? 4))}
              </span>
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
                variations
              </span>
            </div>
          ) : (
            <span className="text-zinc-700">
              {nodeType === 'reference-image'
                ? 'Drop or pick an image'
                : nodeType === 'video-gen'
                ? 'Awaiting first run'
                : nodeType === 'image-gen'
                ? 'Awaiting first run'
                : 'Empty'}
            </span>
          )}
        </div>
      )}

      {/* Dashed lime border that appears INSIDE the media area when a file
          drag is hovering an empty ref node. Sits above the placeholder
          text via z-index but pointer-events:none so it doesn't eat the
          drop event. Uses an inset to avoid clipping the rounded corners. */}
      {isDragOver && isEmptyRefNode && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-1.5 rounded-lg border border-dashed border-skinny-yellow/60"
        />
      )}

      {/* Multi-image hint (single-run batch — e.g. Seedream sequential, or
          fan-out variations). For fan-out we always render the badge so the
          user can see how many variations are sitting on the node, even on
          the single-output case. */}
      {(urls.length > 1 || (nodeType === 'fan-out' && urls.length >= 1)) && !showPagination && (
        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-zinc-300">
          ×{urls.length}
        </div>
      )}

      {/* Per-node generation pagination — Runway-style. Hangs across the
          bottom edge of the media; transparent so the image still reads.
          Buttons use a visible 24px chip with an invisible 32px hit-area
          (::after) so touch targets pass guidance without inflating the UI. */}
      {showPagination && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 py-1.5 flex items-center gap-1.5"
          role="group"
          aria-label={`Generation ${historyIndex + 1} of ${totalRuns}`}
        >
          <button
            type="button"
            onClick={(e) => cycle(-1, e)}
            aria-label="Previous generation"
            className="relative h-6 w-6 rounded-md bg-white/10 hover:bg-white/20 active:bg-white/30 ring-1 ring-white/15 text-zinc-100 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors after:absolute after:-inset-1 after:content-['']"
          >
            <ChevronLeft size={12} aria-hidden />
          </button>
          <span className="text-[10px] font-mono text-zinc-200 tabular-nums select-none">
            {historyIndex + 1}/{totalRuns}
          </span>
          <button
            type="button"
            onClick={(e) => cycle(1, e)}
            aria-label="Next generation"
            className="relative h-6 w-6 rounded-md bg-white/10 hover:bg-white/20 active:bg-white/30 ring-1 ring-white/15 text-zinc-100 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors after:absolute after:-inset-1 after:content-['']"
          >
            <ChevronRight size={12} aria-hidden />
          </button>
          {currentEntry?.label ? (
            <span className="ml-auto text-[10px] text-zinc-200 truncate max-w-[80px]" title={currentEntry.label}>
              {currentEntry.label}
            </span>
          ) : (
            <span className="ml-auto text-[10px] text-zinc-500 italic truncate">
              Run {totalRuns - historyIndex}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function TextBody({ data, nodeType }: { data: SkinnyNodeData; nodeType: NodeType }) {
  // Production-brief shows whichever distilled prompt the executor produced
  // (or a friendly placeholder before the first run). The full `outputText`
  // brief lives behind a double-click into NodeSettingsModal — keeping the
  // node face compact so the canvas stays scannable.
  if (nodeType === 'production-brief') {
    const distilled = (data as any).distilledPrompt as string | undefined
    const briefText = (data as any).outputText as string | undefined
    const preview = distilled || briefText || ''
    const charCount = distilled?.length ?? 0
    return (
      <div className="relative px-3 py-3 min-h-[72px] text-[11px] text-zinc-300 leading-snug">
        {preview ? (
          <>
            <p className="line-clamp-4">{preview}</p>
            {distilled && (
              <p className="mt-1 text-[9px] text-zinc-500 tabular-nums">
                {charCount}/2500 chars
              </p>
            )}
          </>
        ) : (
          <span className="text-zinc-600 italic">
            Wire storyboard refs + concept → run to distill
          </span>
        )}
      </div>
    )
  }

  // For orchestrator nodes, show the actual outputText after run (was a
  // hard-coded placeholder before — never displayed the LLM's response).
  // For text-prompt: prefer the resolved outputText (post-substitution) over
  // the static prompt so users see what actually flowed downstream.
  const outputText = (data as any).outputText as string | undefined
  const content =
    nodeType === 'text-prompt'
      ? outputText || data.prompt
      : nodeType === 'skill'
      ? data.prompt
      : nodeType === 'orchestrator'
      ? outputText || 'Reads canvas context →'
      : nodeType === 'entity'
      ? data.title || 'No entity selected'
      : ''
  return (
    <div className="relative px-3 py-3 min-h-[72px] text-[11px] text-zinc-300 leading-snug">
      {content ? (
        <p className="line-clamp-4">{content}</p>
      ) : (
        <span className="text-zinc-600 italic">Double-click to edit…</span>
      )}
    </div>
  )
}

/**
 * Per-node Run button (image-gen / video-gen only).
 * - Idle / done / error: shows ▶ Play. Click runs this node + all ancestors.
 * - Running THIS node: shows a spinning loader (no-op click).
 * - Running OTHER nodes: shows Stop (lets the user abort the whole run from
 *   any in-flight model node).
 */
function NodeRunButton({
  nodeId,
  isRunning,
  globallyRunning,
  onRun,
  onStop,
}: {
  nodeId: string
  isRunning: boolean
  globallyRunning: boolean
  onRun: () => void
  onStop: () => void
}) {
  const stop = (e: React.MouseEvent) => {
    e.stopPropagation()
    onStop()
  }
  const run = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRun()
  }
  // Per-node action chip sits inside the node footer (28px column-width is
  // tight); we bump min-hit to 24x24 + 6px pad via a hit-expand pseudo so the
  // tap target meets touch guidance even though the visible chip stays small.
  if (isRunning) {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Stop this run"
        title="Stop this run"
        className="relative shrink-0 h-6 w-6 rounded-md bg-rose-500/15 ring-1 ring-rose-500/40 hover:bg-rose-500/25 text-rose-300 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 transition-colors after:absolute after:-inset-1 after:content-['']"
      >
        <Loader2 size={11} className="animate-spin" aria-hidden />
      </button>
    )
  }
  if (globallyRunning) {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Stop run"
        title="Stop run"
        className="relative shrink-0 h-6 w-6 rounded-md bg-white/[0.05] ring-1 ring-white/[0.08] hover:bg-white/[0.10] text-zinc-400 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors after:absolute after:-inset-1 after:content-['']"
      >
        <Square size={9} fill="currentColor" aria-hidden />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={run}
      aria-label="Run this node and all upstream"
      title="Run this node (+ everything upstream)"
      className="relative shrink-0 h-6 w-6 rounded-md bg-skinny-yellow/15 ring-1 ring-skinny-yellow/40 hover:bg-skinny-yellow/30 text-skinny-yellow flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors after:absolute after:-inset-1 after:content-['']"
    >
      <Play size={10} fill="currentColor" aria-hidden />
    </button>
  )
}

export const SkinnyNode = memo(SkinnyNodeBase)
