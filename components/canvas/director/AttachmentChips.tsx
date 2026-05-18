'use client'

// Renders the row of attached reference thumbnails above the Director
// composer. Mirrors the chip vibe from `components/chat/chat-input.tsx`
// but slimmed down for the narrow 400px panel:
//   - 40x40 thumbnails (vs. 56x56 in main chat)
//   - up to 4 visible, then "+N" pill
//   - x button on hover; small loader badge while uploading

import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DirectorAttachmentStatus = 'uploading' | 'ready' | 'error'

export interface DirectorAttachment {
  id: string
  url: string                 // object-url while uploading; HTTPS once ready
  kind: 'image' | 'video'
  name?: string
  status: DirectorAttachmentStatus
  /** Origin of the attachment, for downstream UX & debugging. */
  source: 'upload' | 'url' | 'hub' | 'canvas'
  /** Originating canvas node id, when source === 'canvas'. */
  fromNodeId?: string
  /** Optional transient error from upload. */
  error?: string
  /** Pre-computed Gemini-vision analysis carried from the source (e.g. a
      Skinny Hub asset whose `output_metadata.analysis.text` was stored on
      first analysis, or an upstream canvas node that already analyzed it).
      When present, downstream consumers (reference-image nodes, Director
      chat) MUST skip re-analysis to save tokens + vision credits. */
  visionContext?: string
}

interface AttachmentChipsProps {
  attachments: DirectorAttachment[]
  onRemove: (id: string) => void
  /** Max chips to render inline before the "+N" overflow pill. */
  visibleCap?: number
}

const STATUS_TOOLTIP: Record<DirectorAttachmentStatus, string> = {
  uploading: 'Uploading…',
  ready: 'Ready',
  error: 'Upload failed — remove and try again',
}

const SOURCE_LABEL: Record<DirectorAttachment['source'], string> = {
  upload: 'Uploaded',
  url: 'From URL',
  hub: 'From Skinny Hub',
  canvas: 'From canvas',
}

export function AttachmentChips({
  attachments,
  onRemove,
  visibleCap = 4,
}: AttachmentChipsProps) {
  if (attachments.length === 0) return null

  const visible = attachments.slice(0, visibleCap)
  const overflow = attachments.length - visible.length
  const uploadingCount = attachments.filter((a) => a.status === 'uploading').length
  const errorCount = attachments.filter((a) => a.status === 'error').length

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="overflow-hidden border-b border-white/[0.05] shrink-0"
      role="region"
      aria-label="Attached references"
    >
      <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap">
        <AnimatePresence initial={false}>
          {visible.map((att) => {
            const label = att.name || SOURCE_LABEL[att.source]
            const tip = `${label} · ${STATUS_TOOLTIP[att.status]}`
            return (
              <motion.div
                key={att.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="relative group"
              >
                <div
                  className={cn(
                    'h-10 w-10 rounded-md overflow-hidden ring-1 bg-white/[0.03] relative transition-shadow',
                    att.status === 'error'
                      ? 'ring-rose-500/50'
                      : att.status === 'uploading'
                        ? 'ring-skinny-yellow/40 animate-pulse-soft'
                        : att.source === 'canvas'
                          ? 'ring-skinny-yellow/30'
                          : 'ring-white/[0.08]',
                  )}
                  title={tip}
                  aria-label={tip}
                >
                  {att.kind === 'video' ? (
                    // Video chips show a poster-less black tile w/ label
                    <div className="h-full w-full flex items-center justify-center bg-zinc-800 text-[8px] font-semibold uppercase tracking-wider text-zinc-400">
                      Video
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.url}
                      alt={att.name || 'reference'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {att.status === 'uploading' && (
                    <div
                      className="absolute inset-0 bg-black/55 flex items-center justify-center"
                      aria-live="polite"
                    >
                      <Loader2 size={12} className="animate-spin text-skinny-yellow" />
                    </div>
                  )}
                  {att.status === 'error' && (
                    <div
                      className="absolute inset-0 bg-black/65 flex items-center justify-center"
                      aria-live="polite"
                      title={att.error || 'Upload failed'}
                    >
                      <AlertCircle size={12} className="text-rose-400" />
                    </div>
                  )}
                  {att.source === 'canvas' && att.status === 'ready' && (
                    <span className="absolute bottom-0 left-0 right-0 bg-black/75 text-skinny-yellow text-[7px] font-bold uppercase tracking-wider text-center leading-none py-[1px]">
                      Canvas
                    </span>
                  )}
                </div>
                {/* Hit-target wrapper expands the touch area to ~22px without
                    moving the visual 16px dot. Visible on hover (desktop) and
                    always on touch (where group-hover never triggers). */}
                <button
                  type="button"
                  onClick={() => onRemove(att.id)}
                  aria-label={`Remove ${att.name || 'attachment'}`}
                  className={cn(
                    'absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center',
                    'rounded-full bg-zinc-900 ring-1 ring-white/20 text-zinc-300',
                    'hover:text-white hover:bg-rose-500/85 hover:ring-rose-300/40',
                    'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                    'transition-all opacity-0 group-hover:opacity-100',
                    // Errors stay visible — user needs to dismiss them.
                    att.status === 'error' && 'opacity-100',
                    // Touch devices: always show.
                    '[@media(hover:none)]:opacity-100',
                  )}
                >
                  <X size={10} aria-hidden="true" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {overflow > 0 && (
          <span
            className="h-10 px-2 rounded-md bg-white/[0.04] ring-1 ring-white/[0.08] flex items-center text-[10px] font-medium text-zinc-300"
            title={`${overflow} more attachment${overflow === 1 ? '' : 's'}`}
            aria-label={`${overflow} more attachment${overflow === 1 ? '' : 's'} not shown`}
          >
            +{overflow}
          </span>
        )}
        {(uploadingCount > 0 || errorCount > 0) && (
          <span
            className={cn(
              'ml-auto text-[10px] tabular-nums',
              errorCount > 0 ? 'text-rose-300/90' : 'text-zinc-500',
            )}
            aria-live="polite"
          >
            {errorCount > 0
              ? `${errorCount} failed`
              : `${uploadingCount} uploading…`}
          </span>
        )}
      </div>
    </motion.div>
  )
}
