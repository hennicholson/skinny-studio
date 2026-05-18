'use client'

// MobileNodeSheet — bottom-sheet for editing a single node on a phone/tablet.
//
// The full desktop NodeSettingsModal does a lot (image upload, full schema-
// driven param fields). On mobile we deliberately keep the surface small:
//
//   - text-prompt        → multiline prompt editor
//   - reference-image    → paste a URL (no file picker on mobile v1)
//   - skill              → read-only summary + prompt edit
//   - image-gen/video-gen→ a handful of high-impact params (aspect ratio,
//                          duration, resolution, seed, audio toggle)
//   - fan-out            → variations stepper
//
// All edits are buffered into a local `draft` so the user can cancel out
// without mutating the canvas. `onSave` is fired with a single patch on
// commit.
//
// UX details that matter on touch:
//   - Drag handle bar (visual + drag-to-dismiss)
//   - Full-width, rounded-top
//   - 44x44px touch targets minimum
//   - Inputs scroll themselves into view on focus (keyboard handling)
//   - `env(safe-area-inset-bottom)` padding so the Save button isn't hidden
//     under the home-indicator on iOS

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, PanInfo } from 'framer-motion'
import { ChevronDown, Minus, Plus, X, Image as ImageIcon, Film, Sparkles, Check } from 'lucide-react'
import { CanvasNode, NODE_TYPES } from '@/lib/canvas/ir'
import { StudioModelLite } from './types'

type Patch = Partial<CanvasNode['data']>

export interface MobileNodeSheetProps {
  open: boolean
  node: CanvasNode | null
  // Optional model spec; when present, parameter fields render schema-driven
  // options. When absent (e.g. on the demo route), we fall back to sensible
  // hardcoded defaults so the user can still tweak the basics.
  model?: StudioModelLite
  onClose: () => void
  onSave: (patch: Patch) => void
}

export function MobileNodeSheet({ open, node, model, onClose, onSave }: MobileNodeSheetProps) {
  // Local draft so users can dismiss without committing.
  const [draft, setDraft] = useState<Patch>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset draft whenever a new node is opened.
  useEffect(() => {
    if (open && node) setDraft({})
  }, [open, node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock background scroll while sheet is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Esc key closes (useful on tablets with hardware keyboards).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const merged: CanvasNode | null = useMemo(() => {
    if (!node) return null
    return { ...node, data: { ...node.data, ...draft, params: { ...(node.data.params || {}), ...(draft.params || {}) } } }
  }, [node, draft])

  const patch = useCallback(
    (p: Patch) => setDraft((d) => ({ ...d, ...p, params: { ...(d.params || {}), ...(p.params || {}) } })),
    [],
  )

  const handleSave = useCallback(() => {
    if (Object.keys(draft).length > 0) onSave(draft)
    onClose()
  }, [draft, onSave, onClose])

  // Drag-to-dismiss: if the user drags the handle/header more than 100px
  // down (or flicks fast), close.
  const onDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > 100 || info.velocity.y > 600) onClose()
    },
    [onClose],
  )

  // Auto-scroll the focused input into view above the soft keyboard.
  // visualViewport handles the case where the keyboard pushes content up
  // and the input is now occluded.
  const onFocusCapture = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    // Defer a tick so the keyboard has time to start opening.
    requestAnimationFrame(() => {
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } catch {
        // Some embedded webviews throw on smooth scroll — best effort only.
      }
    })
  }, [])

  if (!node || !merged) return null
  const def = NODE_TYPES[node.type]
  const title = node.data.modelName || node.data.title || def.label

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end justify-center"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${title}`}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
            onFocusCapture={onFocusCapture}
            className="relative w-full sm:max-w-lg rounded-t-2xl bg-zinc-950 ring-1 ring-white/10 shadow-2xl flex flex-col max-h-[88dvh]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Drag handle */}
            <div className="pt-2.5 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing select-none">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="px-4 pb-3 pt-1 flex items-center gap-3 border-b border-white/[0.06] shrink-0">
              <div className="w-9 h-9 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] flex items-center justify-center shrink-0">
                <NodeIcon type={node.type} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-zinc-100 truncate">{title}</h3>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 truncate">
                  {def.label}
                  {merged.data.status && merged.data.status !== 'idle' && (
                    <span className="ml-1.5 normal-case tracking-normal text-zinc-400">· {merged.data.status}</span>
                  )}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-md flex items-center justify-center text-zinc-400 hover:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-skinny-yellow/40"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <SheetFields node={merged} model={model} onPatch={patch} />

              {merged.data.status === 'error' && merged.data.error && (
                <div className="px-3 py-2 rounded-md bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300">
                  {merged.data.error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 pt-3 pb-3 border-t border-white/[0.06] flex items-center gap-2 shrink-0">
              <button
                onClick={onClose}
                className="flex-1 h-11 rounded-md bg-white/[0.04] ring-1 ring-white/[0.08] text-sm font-medium text-zinc-200 active:bg-white/[0.08] focus:outline-none focus:ring-1 focus:ring-skinny-yellow/40"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={Object.keys(draft).length === 0}
                className="flex-1 h-11 rounded-md bg-skinny-yellow text-zinc-900 text-sm font-semibold active:bg-skinny-yellow/90 disabled:opacity-40 disabled:active:bg-skinny-yellow focus:outline-none focus:ring-2 focus:ring-skinny-yellow/60"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// =====================================================================
// Field stack — branches on node.type. Mirrors NodeSettingsModal but
// trimmed for the mobile use case (no file upload, smaller param surface).
// =====================================================================
function SheetFields({
  node,
  model,
  onPatch,
}: {
  node: CanvasNode
  model: StudioModelLite | undefined
  onPatch: (p: Patch) => void
}) {
  const params = node.data.params || {}
  const updateParams = (p: Record<string, any>) => onPatch({ params: { ...params, ...p } })

  return (
    <>
      <SheetField label="Label">
        <input
          type="text"
          value={node.data.title || ''}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder={NODE_TYPES[node.type].label}
          className="ss-input h-11 text-base"
          autoCapitalize="sentences"
          autoComplete="off"
          spellCheck
        />
      </SheetField>

      {node.type === 'text-prompt' && (
        <SheetField label="Prompt" required>
          <textarea
            value={node.data.prompt || ''}
            onChange={(e) => onPatch({ prompt: e.target.value })}
            rows={6}
            placeholder="Describe what to generate…"
            className="ss-input resize-none text-base leading-relaxed"
            autoCapitalize="sentences"
            spellCheck
          />
        </SheetField>
      )}

      {node.type === 'skill' && (
        <SheetField label="Skill prompt">
          <textarea
            value={node.data.prompt || ''}
            onChange={(e) => onPatch({ prompt: e.target.value })}
            rows={5}
            placeholder="Skill template…"
            className="ss-input resize-none text-base leading-relaxed"
          />
          <p className="mt-1.5 text-[10px] text-zinc-500">
            Edit the skill text inline. The original saved skill isn&apos;t modified.
          </p>
        </SheetField>
      )}

      {node.type === 'reference-image' && (
        <SheetField label="Image URL">
          <input
            type="url"
            inputMode="url"
            value={node.data.imageUrl || ''}
            onChange={(e) => onPatch({ imageUrl: e.target.value })}
            placeholder="https://…"
            className="ss-input h-11 text-base"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {node.data.imageUrl && (
            <div className="mt-3 w-full aspect-video rounded-md overflow-hidden bg-black/40 ring-1 ring-white/[0.05]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={node.data.imageUrl}
                alt="Reference preview"
                className="w-full h-full object-contain"
                onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
              />
            </div>
          )}
          <p className="mt-2 text-[10px] text-zinc-500">
            Paste an image URL. File uploads are available on desktop.
          </p>
        </SheetField>
      )}

      {(node.type === 'image-gen' || node.type === 'video-gen') && (
        <ModelParams node={node} model={model} update={updateParams} />
      )}

      {node.type === 'fan-out' && (
        <SheetField label="Variations">
          <SheetStepper
            value={node.data.variations ?? 4}
            min={2}
            max={8}
            onChange={(v) => onPatch({ variations: v })}
            suffix="variations"
          />
        </SheetField>
      )}
    </>
  )
}

function ModelParams({
  node,
  model,
  update,
}: {
  node: CanvasNode
  model: StudioModelLite | undefined
  update: (p: Record<string, any>) => void
}) {
  const params = node.data.params || {}
  const schema: any = model?.parameter_schema || {}
  const isVideo = node.type === 'video-gen'

  if (!isVideo) {
    const aspectOptions: string[] = schema.aspect_ratio?.options || ['auto', '1:1', '16:9', '9:16', '4:3', '3:4']
    return (
      <SheetField label="Aspect ratio">
        <SheetSelect
          value={params.aspect_ratio || schema.aspect_ratio?.default || 'auto'}
          options={aspectOptions}
          onChange={(v) => update({ aspect_ratio: v })}
        />
      </SheetField>
    )
  }

  const durationOptions: number[] = schema.duration?.options || [5, 10]
  const resolutionOptions: string[] = schema.resolution?.options || ['720p']
  const hasAudio = !!schema.generate_audio

  return (
    <>
      <SheetField label="Duration">
        <SheetSelect
          value={params.duration ?? schema.duration?.default ?? durationOptions[0]}
          options={durationOptions.map((d) => ({ value: d, label: `${d}s` }))}
          onChange={(v) => update({ duration: Number(v) })}
        />
      </SheetField>
      <SheetField label="Resolution">
        <SheetSelect
          value={params.resolution ?? schema.resolution?.default ?? resolutionOptions[0]}
          options={resolutionOptions}
          onChange={(v) => update({ resolution: String(v) })}
        />
      </SheetField>
      <SheetField label="Seed">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={params.seed ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') update({ seed: undefined })
            else if (/^\d+$/.test(raw)) update({ seed: Number(raw) })
          }}
          placeholder="Random"
          className="ss-input h-11 text-base"
        />
      </SheetField>
      {hasAudio && (
        <SheetToggle
          label="Generate audio"
          on={params.generate_audio ?? true}
          onChange={(v) => update({ generate_audio: v })}
        />
      )}
    </>
  )
}

// =====================================================================
// Touch-friendly atoms (44px+ targets, larger base font to stop iOS zoom)
// =====================================================================
function SheetField({
  label,
  children,
  required,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
        {label}
        {required && <span className="text-rose-400/80 ml-1" aria-hidden>*</span>}
      </label>
      {children}
    </div>
  )
}

function SheetStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  suffix?: string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex items-center rounded-md ring-1 ring-white/[0.08] bg-white/[0.03] overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label="Decrease"
          className="w-11 h-11 flex items-center justify-center text-zinc-200 active:bg-white/[0.08] disabled:opacity-30 focus:outline-none"
        >
          <Minus size={14} />
        </button>
        <div className="w-12 h-11 flex items-center justify-center text-sm tabular-nums text-zinc-100 border-x border-white/[0.06]">
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label="Increase"
          className="w-11 h-11 flex items-center justify-center text-zinc-200 active:bg-white/[0.08] disabled:opacity-30 focus:outline-none"
        >
          <Plus size={14} />
        </button>
      </div>
      {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
    </div>
  )
}

function SheetSelect({
  value,
  options,
  onChange,
}: {
  value: any
  options: any[] | { value: any; label: string }[]
  onChange: (v: any) => void
}) {
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }))
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ss-input h-11 text-base appearance-none pr-9 cursor-pointer"
      >
        {opts.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500"
      />
    </div>
  )
}

function SheetToggle({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between min-h-[44px]">
      <span className="text-sm text-zinc-200">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        aria-label={label}
        className={`relative w-12 h-7 rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-skinny-yellow/40 ${
          on ? 'bg-skinny-yellow' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${
            on ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function NodeIcon({ type }: { type: CanvasNode['type'] }) {
  switch (type) {
    case 'video-gen':
      return <Film size={14} className="text-zinc-300" />
    case 'image-gen':
    case 'reference-image':
    case 'output':
      return <ImageIcon size={14} className="text-zinc-300" />
    case 'skill':
      return <Sparkles size={14} className="text-skinny-yellow" />
    case 'fan-out':
      return <Check size={14} className="text-zinc-300" />
    default:
      return <span className="text-[10px] font-mono text-zinc-400">{type.charAt(0).toUpperCase()}</span>
  }
}
