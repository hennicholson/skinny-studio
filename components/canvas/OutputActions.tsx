'use client'

// Output asset action toolbar — overlays a finished canvas output (image or
// video) with quick verbs: Copy, Download, Save to Library, Publish, Remix.
//
// Design notes:
//  - Desktop (>= md): a small floating pill anchored top-right of the asset,
//    revealed on hover. Reads as "tools available" without competing with
//    the asset's visual weight when idle. Matches the language of the rest
//    of the Skinny canvas (chrome appears on hover, recedes when not needed).
//  - Mobile (< md): a full-width action row pinned to the BOTTOM of the
//    asset, always visible. Touch users don't have a hover state, and the
//    44px touch-target rule means we can't shrink-and-hide. Bottom anchoring
//    keeps the asset's focal point clear and matches iOS share-sheet muscle
//    memory.
//  - All five actions surface here, but Publish & Save are image-only when
//    `kind === 'video'` (upload-image API rejects videos by MIME type and the
//    current gallery flow assumes a saved generation row). We render those
//    actions in a dimmed/disabled state with a tooltip on video so users see
//    the affordance and understand the limit, rather than silently hiding.
//  - We do NOT mount this component anywhere — SkinnyNode integration is
//    pending in a later patch. This file is purely a self-contained surface
//    that parents can drop in (typically positioned `absolute inset-0` over a
//    media element with `pointer-events-none` on idle, then auto on hover).

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Copy,
  Download,
  BookmarkPlus,
  Share2,
  Sparkles,
  Loader2,
} from 'lucide-react'
import {
  copyUrl,
  downloadAsset,
  saveToLibrary,
  publishToGallery,
} from '@/lib/canvas/output-actions'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'

export interface OutputActionsProps {
  /** The output asset URL (image or video, signed/public). */
  url: string
  /** Kind drives which actions are available (videos can't go to image library). */
  kind: 'image' | 'video'
  /** Source node id — passed back to the remix callback so the parent can
   *  thread the new Reference node into the graph next to it. */
  sourceNodeId?: string
  /** Called with the asset URL when the user hits Remix. Parent owns the IR
   *  mutation (creating a new reference-image node + edge). */
  onRemix?: (url: string) => void
  /** Existing generation id, when known. Lets Publish skip the save-first
   *  round-trip. When omitted, Publish will save-to-library first to obtain
   *  a generation id, then publish. */
  generationId?: string
  /** Optional className passthrough so callers can tweak positioning. */
  className?: string
}

type ActionKey = 'copy' | 'download' | 'save' | 'publish' | 'remix'

export function OutputActions({
  url,
  kind,
  sourceNodeId: _sourceNodeId,
  onRemix,
  generationId,
  className,
}: OutputActionsProps) {
  const getHeaders = useWhopHeaders()
  // Per-action loading flag so users can fire multiple verbs in parallel
  // (e.g. download while save is in-flight) without one blocking the other.
  const [busy, setBusy] = useState<Record<ActionKey, boolean>>({
    copy: false,
    download: false,
    save: false,
    publish: false,
    remix: false,
  })

  const setLoading = (key: ActionKey, v: boolean) =>
    setBusy((prev) => ({ ...prev, [key]: v }))

  const handleCopy = useCallback(async () => {
    setLoading('copy', true)
    try {
      await copyUrl(url)
      toast.success('URL copied to clipboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Copy failed')
    } finally {
      setLoading('copy', false)
    }
  }, [url])

  const handleDownload = useCallback(async () => {
    setLoading('download', true)
    const t = toast.loading('Preparing download…')
    try {
      await downloadAsset(url)
      toast.success('Download started', { id: t })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed', { id: t })
    } finally {
      setLoading('download', false)
    }
  }, [url])

  const handleSave = useCallback(async () => {
    if (kind !== 'image') {
      toast.error('Library currently supports images only')
      return
    }
    setLoading('save', true)
    const t = toast.loading('Saving to Skinny Hub…')
    try {
      const res = await saveToLibrary(url, getHeaders())
      if (res.ok) {
        toast.success('Saved to library', { id: t })
      } else {
        toast.error(res.error || 'Save failed', { id: t })
      }
    } finally {
      setLoading('save', false)
    }
  }, [url, kind, getHeaders])

  const handlePublish = useCallback(async () => {
    if (kind !== 'image') {
      toast.error('Gallery publishing currently supports images only')
      return
    }
    setLoading('publish', true)
    const t = toast.loading('Publishing to gallery…')
    try {
      let genId = generationId
      // Gallery publish requires a generationId — if we don't have one (this
      // output was produced ad-hoc and never saved), save-to-library first to
      // mint one, then publish. One toast, two requests, but only the
      // failure-causing one surfaces an error.
      if (!genId) {
        const saveRes = await saveToLibrary(url, getHeaders())
        if (!saveRes.ok || !saveRes.generationId) {
          toast.error(saveRes.error || 'Could not save before publish', { id: t })
          return
        }
        genId = saveRes.generationId
      }
      const res = await publishToGallery(url, { generationId: genId }, getHeaders())
      if (res.ok) {
        toast.success('Published to Creator Gallery', { id: t })
      } else {
        toast.error(res.error || 'Publish failed', { id: t })
      }
    } finally {
      setLoading('publish', false)
    }
  }, [url, kind, generationId, getHeaders])

  const handleRemix = useCallback(() => {
    if (!onRemix) {
      toast.error('Remix is not available in this context')
      return
    }
    setLoading('remix', true)
    try {
      onRemix(url)
      toast.success('Added as reference')
    } finally {
      setLoading('remix', false)
    }
  }, [url, onRemix])

  const imageOnlyDisabled = kind !== 'image'

  const actions: Array<{
    key: ActionKey
    label: string
    icon: typeof Copy
    onClick: () => void
    disabled?: boolean
    disabledReason?: string
  }> = [
    { key: 'copy', label: 'Copy URL', icon: Copy, onClick: handleCopy },
    { key: 'download', label: 'Download', icon: Download, onClick: handleDownload },
    {
      key: 'save',
      label: 'Save to Library',
      icon: BookmarkPlus,
      onClick: handleSave,
      disabled: imageOnlyDisabled,
      disabledReason: 'Videos can\'t be saved to the image library yet',
    },
    {
      key: 'publish',
      label: 'Publish',
      icon: Share2,
      onClick: handlePublish,
      disabled: imageOnlyDisabled,
      disabledReason: 'Gallery publishing supports images for now',
    },
    { key: 'remix', label: 'Remix', icon: Sparkles, onClick: handleRemix },
  ]

  return (
    <>
      {/* Desktop floating toolbar — hover-revealed, top-right of the asset. */}
      <div
        className={`hidden md:flex pointer-events-none absolute top-2 right-2 z-10 ${className || ''}`}
      >
        <AnimatePresence>
          <motion.div
            key="desktop-bar"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="pointer-events-auto flex items-center gap-0.5 rounded-xl bg-black/70 backdrop-blur-md ring-1 ring-white/[0.08] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] p-1 opacity-0 group-hover/output:opacity-100 transition-opacity duration-150"
          >
            {actions.map((a) => (
              <ActionButton
                key={a.key}
                label={a.label}
                icon={a.icon}
                loading={busy[a.key]}
                disabled={a.disabled}
                disabledReason={a.disabledReason}
                onClick={a.onClick}
                variant="desktop"
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile action row — always visible, bottom of the asset. */}
      <div
        className={`md:hidden absolute left-0 right-0 bottom-0 z-10 ${className || ''}`}
      >
        <div className="flex items-stretch justify-between gap-0.5 bg-gradient-to-t from-black/85 via-black/65 to-transparent px-1.5 pt-6 pb-1.5">
          {actions.map((a) => (
            <ActionButton
              key={a.key}
              label={a.label}
              icon={a.icon}
              loading={busy[a.key]}
              disabled={a.disabled}
              disabledReason={a.disabledReason}
              onClick={a.onClick}
              variant="mobile"
            />
          ))}
        </div>
      </div>
    </>
  )
}

function ActionButton({
  label,
  icon: Icon,
  loading,
  disabled,
  disabledReason,
  onClick,
  variant,
}: {
  label: string
  icon: typeof Copy
  loading: boolean
  disabled?: boolean
  disabledReason?: string
  onClick: () => void
  variant: 'desktop' | 'mobile'
}) {
  const isMobile = variant === 'mobile'
  const interactive = !loading && !disabled

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      aria-label={label}
      aria-disabled={disabled || loading}
      title={disabled ? disabledReason || label : label}
      // Mobile buttons are flex-1 so they distribute evenly across the row
      // and each meets the 44px touch-target minimum (44 high, ~64 wide).
      className={
        isMobile
          ? `flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-md text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors ${
              interactive ? 'active:bg-white/10' : ''
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`
          : `relative w-8 h-8 flex items-center justify-center rounded-lg text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors ${
              interactive ? 'hover:bg-white/10 hover:text-white active:bg-white/15' : ''
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`
      }
    >
      {loading ? (
        <Loader2 size={isMobile ? 16 : 14} className="animate-spin" />
      ) : (
        <Icon size={isMobile ? 16 : 14} />
      )}
      {isMobile && (
        <span className="text-[9px] font-medium leading-none tracking-wide">
          {label.split(' ')[0]}
        </span>
      )}
    </button>
  )
}
