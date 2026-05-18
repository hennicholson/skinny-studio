'use client'

// Centered "Settings" modal that opens on node double-click. Mirrors the
// Runway-style settings sheet: back arrow, "ModelName · Settings" title,
// field stack, Done button. Driven by the studio_models.parameter_schema so
// the same component renders any model's params.
//
// Polish pass:
//   - Mobile bottom-sheet (< sm) with drag handle
//   - Live preview area at the top reflecting current node output
//   - Stepper buttons for integer/numeric params (e.g. variations)
//   - Subtle red ring on required-but-empty inputs after interaction
//   - Skill picker shows a "selected" card with "Use a different skill"
//   - Focusable Done button + Enter submits when on it

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Upload,
  Loader2,
  X,
  Sparkles,
  Minus,
  Plus,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Film,
} from 'lucide-react'
import { Canvas, CanvasNode, NODE_TYPES } from '@/lib/canvas/ir'
import { StudioModelLite } from './types'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'
import { AttachmentPickerModal } from './director/AttachmentPickerModal'
import { analyzeReferenceImage } from '@/lib/canvas/vision'
import { EntityPickerField } from './EntityPickerField'
import { cn } from '@/lib/utils'
import {
  getModelLimits,
  conflictsFor,
  describeReferenceCaps,
} from '@/lib/canvas/model-spec-bridge'

interface NodeSettingsModalProps {
  open: boolean
  node: CanvasNode | null
  model: StudioModelLite | undefined
  /** Full model registry so model-typed nodes can be swapped. */
  models: StudioModelLite[]
  /** Current canvas — threaded through so the reference-image picker can
      surface the "This canvas" tab (pull any existing canvas output as a ref). */
  canvas: Canvas
  /** Whop auth headers for hub fetch + uploads. */
  getWhopHeaders: () => Record<string, string>
  onClose: () => void
  onChange: (patch: Partial<CanvasNode['data']>) => void
}

export function NodeSettingsModal({
  open,
  node,
  model,
  models,
  canvas,
  getWhopHeaders,
  onClose,
  onChange,
}: NodeSettingsModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const doneBtnRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Esc closes regardless of focus position. Listener attached to window so it
  // catches even when focus is inside the body / footer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Auto-focus the Done button on open so Enter commits without an extra Tab.
  // Tab still flows to Cancel (footer order) and Shift+Tab into the body.
  // Defer one frame so the AnimatePresence enter transition has mounted the
  // node before .focus() runs.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => doneBtnRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open, node?.id])

  // Stop scroll-chaining: when the user reaches the top/bottom of the modal
  // body on touch devices, the underlying canvas was scrolling along. Lock
  // body scroll while the modal is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!node) return null
  const def = NODE_TYPES[node.type]
  const title = node.data.modelName || node.data.title || def.label
  const titleId = `node-settings-title-${node.id}`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <motion.div
            ref={cardRef}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              // Mobile: full-screen sheet anchored to the bottom with rounded
              // top corners. Desktop: centred dialog capped at sm. Mobile
              // height uses `dvh` so the sheet shrinks when the on-screen
              // keyboard appears — without `dvh` the focused input vanishes
              // under the keyboard on iOS Safari.
              'w-full bg-zinc-950 ring-1 ring-white/10 shadow-2xl overflow-hidden flex flex-col',
              'rounded-t-2xl sm:rounded-2xl',
              'h-[92dvh] sm:h-auto sm:max-w-sm sm:max-h-[88vh]',
            )}
          >
            {/* Mobile drag handle (visual only) */}
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-9 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header (sticky on mobile) */}
            <div className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.05] shrink-0">
              <button
                onClick={onClose}
                className="relative w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors after:absolute after:-inset-2 after:content-['']"
                aria-label="Close settings"
                title="back (Esc)"
              >
                <ArrowLeft size={13} aria-hidden="true" />
              </button>
              <h3 id={titleId} className="text-sm font-medium text-zinc-100 truncate flex-1 min-w-0">
                {title}
                <span className="text-zinc-500 font-normal"> · settings</span>
              </h3>
            </div>

            {/* Body */}
            <div
              ref={bodyRef}
              className="p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0"
            >
              <NodePreview node={node} />
              <NodeFields
                node={node}
                model={model}
                models={models}
                canvas={canvas}
                getWhopHeaders={getWhopHeaders}
                onChange={onChange}
              />
              {node.data.status === 'error' && node.data.error && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 text-[11px] text-rose-300 leading-relaxed"
                >
                  <span className="font-semibold">last run failed:</span> {node.data.error}
                </div>
              )}
            </div>

            {/* Footer (sticky on mobile) */}
            <div className="px-4 py-3 border-t border-white/[0.05] flex items-center justify-end gap-2 shrink-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              <button
                type="button"
                onClick={onClose}
                className="h-11 sm:h-8 px-4 sm:px-3 rounded-md text-[13px] sm:text-[12px] font-medium text-zinc-300 hover:text-white hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/40 transition-colors"
              >
                cancel
              </button>
              <button
                ref={doneBtnRef}
                onClick={onClose}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onClose()
                  }
                }}
                className="h-11 sm:h-8 px-5 sm:px-4 rounded-md bg-skinny-yellow text-black text-[13px] sm:text-[12px] font-semibold hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-all shadow-md shadow-skinny-yellow/20"
              >
                done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// =====================================================================
// Live preview — small "what this node currently emits" card at the top
// of the settings sheet, so users can see the state they're editing.
// =====================================================================
function NodePreview({ node }: { node: CanvasNode }) {
  const type = node.type

  if (type === 'text-prompt' || type === 'skill') {
    const text = (node.data.prompt || '').trim()
    return (
      <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.05] p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Preview</div>
        {text ? (
          <p className="text-[12px] leading-relaxed text-zinc-200 line-clamp-4 whitespace-pre-wrap">
            {text}
          </p>
        ) : (
          <p className="text-[11px] text-zinc-600 italic">No prompt yet.</p>
        )}
      </div>
    )
  }

  if (type === 'reference-image') {
    const url = node.data.imageUrl
    return (
      <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.05] p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Preview</div>
        {url ? (
          <div className="w-full aspect-video rounded-md overflow-hidden bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
            />
          </div>
        ) : (
          <div className="w-full aspect-video rounded-md bg-black/40 ring-1 ring-white/[0.04] flex items-center justify-center">
            <ImageIcon size={18} className="text-zinc-600" />
          </div>
        )}
      </div>
    )
  }

  if (type === 'image-gen' || type === 'video-gen') {
    const out = node.data.outputUrls?.[0]
    const isVideo = type === 'video-gen'
    return (
      <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.05] p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center justify-between">
          <span>Model</span>
          {node.data.status && node.data.status !== 'idle' && (
            <span className="text-zinc-500 normal-case tracking-normal">{node.data.status}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-md bg-black/40 ring-1 ring-white/[0.05] overflow-hidden flex items-center justify-center shrink-0">
            {out ? (
              isVideo ? (
                /* eslint-disable-next-line jsx-a11y/media-has-caption */
                <video src={out} className="w-full h-full object-cover" muted playsInline />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={out} alt="" className="w-full h-full object-cover" />
              )
            ) : isVideo ? (
              <Film size={16} className="text-zinc-600" />
            ) : (
              <ImageIcon size={16} className="text-zinc-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-zinc-200 truncate">
              {node.data.modelName || 'No model selected'}
            </div>
            <div className="text-[10px] text-zinc-500 truncate">
              {node.data.modelSlug || (isVideo ? 'video model' : 'image model')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Other node types (fan-out, output, entity, orchestrator) — keep the
  // preview minimal so the field stack does the heavy lifting.
  return null
}

function NodeFields({
  node,
  model,
  models,
  canvas,
  getWhopHeaders,
  onChange,
}: {
  node: CanvasNode
  model: StudioModelLite | undefined
  models: StudioModelLite[]
  canvas: Canvas
  getWhopHeaders: () => Record<string, string>
  onChange: (patch: Partial<CanvasNode['data']>) => void
}) {
  const params = node.data.params || {}
  const update = (p: Record<string, any>) => onChange({ params: { ...params, ...p } })

  return (
    <>
      <Field label="Label" hint="Optional. Shown on the node card.">
        <input
          type="text"
          value={node.data.title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={NODE_TYPES[node.type].label}
          className="ss-input"
          maxLength={60}
        />
      </Field>

      {node.type === 'text-prompt' && (
        <Field
          label="Prompt"
          required
          hint="This prompt feeds any image-gen or video-gen node downstream. Seedance caps prompts at 2500 chars; other models accept more."
        >
          <TouchTextarea
            value={node.data.prompt || ''}
            onChange={(v) => onChange({ prompt: v })}
            rows={5}
            placeholder="describe what to generate…"
            required
            // 2500 is the strictest cap we know about (Seedance). Surfacing
            // it as the live counter on every text-prompt is conservative
            // but harmless — looser models simply never hit it.
            maxChars={getModelLimits('seedance-2.0').maxPromptChars ?? 2500}
            showCount
          />
        </Field>
      )}

      {node.type === 'reference-image' && (
        <ImageUploadField
          imageUrl={node.data.imageUrl}
          visionContext={node.data.visionContext}
          onPatch={(patch) => onChange(patch)}
          canvas={canvas}
          getWhopHeaders={getWhopHeaders}
        />
      )}

      {node.type === 'skill' && (
        <SkillPickerField
          selectedId={node.data.skillId}
          onChange={(skill) => onChange({ skillId: skill.id, prompt: skill.prompt, title: skill.title })}
        />
      )}

      {node.type === 'entity' && (
        <EntityPickerField
          selectedId={node.data.entityId}
          onChange={(ent) =>
            // Persist the description (visionContext) so the executor's
            // out:prompt handle has something useful to emit downstream,
            // and stash imageUrl + title for out:image / out:entity.
            onChange({
              entityId: ent.id,
              title: ent.title,
              imageUrl: ent.imageUrl,
              visionContext: ent.visionContext,
            })
          }
        />
      )}

      {node.type === 'orchestrator' && (
        <>
          <Field
            label="Director instruction"
            hint="Runs the Creative Director when this node executes. The reply is emitted on out:prompt — any downstream model node can consume it."
          >
            <TouchTextarea
              value={node.data.prompt || ''}
              onChange={(v) => onChange({ prompt: v })}
              rows={4}
              placeholder="optional — e.g. 'write a cinematic prompt for a hero shot in a neon-lit alley'"
            />
          </Field>
          {/* Read-only echo of the latest Director response. Shown only after
              a run has produced text so we don't clutter the sheet on a fresh
              node. Mirrors the production-brief distilledPrompt panel so the
              two utility-LLM nodes feel consistent. */}
          {node.data.outputText && (
            <div className="rounded-md bg-white/[0.02] ring-1 ring-white/[0.05] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Latest output
                </span>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {(node.data.outputText || '').length} chars
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-8">
                {node.data.outputText}
              </p>
            </div>
          )}
        </>
      )}

      {(node.type === 'image-gen' || node.type === 'video-gen') && (
        <>
          <ModelPickerField
            currentSlug={node.data.modelSlug}
            category={node.type === 'video-gen' ? 'video' : 'image'}
            models={models}
            onPick={(m) => {
              // Reset model-specific params when switching — the new model's
              // schema may not accept the old fields (e.g. veo's audio toggle
              // doesn't exist on flux, wan bakes aspect into resolution). The
              // cascade clears: sequential_image_generation, max_images,
              // lock_seed, generate_audio, seed, fps, duration, resolution,
              // aspect_ratio. Then we seed any defaults from the new schema
              // so the UI shows sensible values without an extra interaction.
              const sch: any = m.parameter_schema || {}
              const seededParams: Record<string, any> = {}
              // Walk every key in the schema; if the entry has a `default`,
              // seed it. This covers any param the schema author bothered to
              // set a default on (output_format, safety_tolerance, guidance,
              // etc.) without us having to hardcode each one.
              for (const [key, raw] of Object.entries(sch)) {
                const entry = raw as { default?: any } | undefined
                if (entry && entry.default !== undefined) {
                  seededParams[key] = entry.default
                }
              }
              onChange({
                modelSlug: m.slug,
                modelName: m.name,
                title:
                  !node.data.title || node.data.title === node.data.modelName
                    ? m.name
                    : node.data.title,
                params: seededParams,
              })
            }}
          />
          {model && <ModelParameterFields node={node} model={model} update={update} />}
        </>
      )}

      {node.type === 'fan-out' && (
        <Field
          label="Variations"
          hint="The fan-out copies its input into this many parallel paths."
        >
          <Stepper
            value={node.data.variations ?? 4}
            min={2}
            max={8}
            onChange={(v) => onChange({ variations: v })}
            suffix={(node.data.variations ?? 4) === 1 ? 'variation' : 'variations'}
          />
        </Field>
      )}

      {node.type === 'production-brief' && (
        <ProductionBriefFields
          targetModel={node.data.targetModel || 'seedance-2.0'}
          style={node.data.style || 'cinematic'}
          audioFocus={node.data.audioFocus ?? true}
          motionEmphasis={node.data.motionEmphasis || 'standard'}
          extraNotes={node.data.extraNotes || ''}
          distilledPrompt={node.data.distilledPrompt}
          outputText={node.data.outputText}
          onChange={(patch) => onChange(patch)}
        />
      )}
    </>
  )
}

// =====================================================================
// Production-brief settings.
// All fields write to the node data directly (NOT into params) — this
// node is an orchestrator-style internal job, not a Replicate model.
// =====================================================================
function ProductionBriefFields({
  targetModel,
  style,
  audioFocus,
  motionEmphasis,
  extraNotes,
  distilledPrompt,
  outputText,
  onChange,
}: {
  targetModel: string
  style: string
  audioFocus: boolean
  motionEmphasis: string
  extraNotes: string
  distilledPrompt?: string
  outputText?: string
  onChange: (patch: Partial<CanvasNode['data']>) => void
}) {
  // Pull the actual model cap from the spec bridge so the counter reflects
  // whichever target the brief is shaped for. Default to 2500 (Seedance) so
  // the existing UX stays put if the spec lookup ever returns undefined.
  const promptCap = getModelLimits(targetModel).maxPromptChars ?? 2500
  const charCount = distilledPrompt?.length ?? 0
  const overCap = charCount > promptCap
  return (
    <>
      <Field
        label="Target model"
        hint="The brief is shaped to fit this model's prompt syntax. Seedance is currently the only live target; GPT Image 2 is roadmap."
      >
        <Select
          value={targetModel}
          options={[
            { value: 'seedance-2.0', label: 'Seedance 2.0 (video)' },
            { value: 'gpt-image-2', label: 'GPT Image 2 (coming soon)' },
          ]}
          onChange={(v) => onChange({ targetModel: String(v) })}
        />
      </Field>
      <Field label="Style" hint="Drives the tone of the long-form brief.">
        <Select
          value={style}
          options={[
            'cinematic',
            'commercial',
            'documentary',
            'music-video',
            'animatic',
          ]}
          onChange={(v) => onChange({ style: String(v) as any })}
        />
      </Field>
      <Field label="Motion emphasis" hint="Rhythm of the camera + subject movement called out in the prompt.">
        <Select
          value={motionEmphasis}
          options={['subtle', 'standard', 'dynamic']}
          onChange={(v) => onChange({ motionEmphasis: String(v) as any })}
        />
      </Field>
      <Toggle
        label="Audio focus"
        hint="When on, the distilled prompt includes dialogue (in double quotes), SFX, and BGM cues."
        on={audioFocus}
        onChange={(v) => onChange({ audioFocus: v })}
      />
      <Field label="Extra direction (optional)" hint="Anything the AI should privilege — character names, brand notes, tonal adjectives.">
        <TouchTextarea
          value={extraNotes}
          onChange={(v) => onChange({ extraNotes: v })}
          rows={3}
          placeholder="e.g. shot on Cinestill 800T, hero is left-handed, brand color must be #FFCC00"
        />
      </Field>
      {distilledPrompt && (
        <div className="rounded-md bg-white/[0.02] ring-1 ring-white/[0.05] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Distilled prompt
            </span>
            <span className={cn('text-[10px] tabular-nums', overCap ? 'text-rose-400' : 'text-zinc-500')}>
              {charCount}/{promptCap}
            </span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-6">
            {distilledPrompt}
          </p>
        </div>
      )}
      {outputText && (
        <div className="rounded-md bg-white/[0.02] ring-1 ring-white/[0.05] p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
            Long-form brief
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-12">
            {outputText}
          </p>
        </div>
      )}
    </>
  )
}

function ModelParameterFields({
  node,
  model,
  update,
}: {
  node: CanvasNode
  model: StudioModelLite
  update: (p: Record<string, any>) => void
}) {
  const params = node.data.params || {}
  const schema: any = model.parameter_schema || {}
  const isVideo = model.category === 'video'
  // Structural caps (maxReferenceImages, maxReferenceVideos, ...) live in
  // MODEL_SPECS only — the DB parameter_schema doesn't carry them. The
  // ReferenceCapsChip + SeedanceMutexNote read them via getModelLimits()
  // through @/lib/canvas/model-spec-bridge so this component doesn't have
  // to depend on the spec module directly.

  if (!isVideo) {
    const isSeedream = typeof model.slug === 'string' && model.slug.startsWith('seedream')
    const sequentialOn = params.sequential_image_generation === 'auto'
    const seedreamMaxImages = Math.max(1, Math.min(15, Number(params.max_images) || 10))
    return (
      <>
        <ReferenceCapsChip slug={model.slug} />
        <Field label="Aspect ratio">
          <Select
            value={params.aspect_ratio || schema.aspect_ratio?.default || 'auto'}
            options={schema.aspect_ratio?.options || ['auto', '1:1', '16:9', '9:16', '4:3', '3:4']}
            onChange={(v) => update({ aspect_ratio: v })}
          />
        </Field>
        {schema.negative_prompt && (
          <Field
            label="Negative prompt"
            hint={
              (schema.negative_prompt.description as string | undefined) ||
              'What to exclude from the image.'
            }
          >
            <TouchTextarea
              value={params.negative_prompt || ''}
              onChange={(v) => update({ negative_prompt: v })}
              rows={2}
              placeholder="e.g. blurry, low quality, watermark"
            />
          </Field>
        )}
        {schema.output_format?.options && (
          <Field label="Output format">
            <Select
              value={params.output_format ?? schema.output_format.default ?? schema.output_format.options[0]}
              options={schema.output_format.options}
              onChange={(v) => update({ output_format: String(v) })}
            />
          </Field>
        )}
        {isSeedream && (
          <>
            <Toggle
              label="Sequential images"
              hint="Render up to 15 images in one run. Great for character turnarounds or story beats."
              on={sequentialOn}
              onChange={(v) =>
                update(
                  v
                    ? {
                        sequential_image_generation: 'auto',
                        // Initialize max_images on first enable so the run
                        // actually produces multiple outputs.
                        ...(params.max_images ? {} : { max_images: 10 }),
                      }
                    : {
                        sequential_image_generation: 'disabled',
                        // Clear max_images on disable so a stale cap doesn't
                        // get sent to the API on the next run.
                        max_images: undefined,
                      },
                )
              }
            />
            {sequentialOn && (
              <Field label="Max images" hint="The model decides how many to make up to this cap.">
                <Stepper
                  value={seedreamMaxImages}
                  min={2}
                  max={15}
                  onChange={(n) => update({ max_images: n })}
                  suffix={seedreamMaxImages === 1 ? 'image' : 'images'}
                />
              </Field>
            )}
          </>
        )}
      </>
    )
  }

  // ===== Video models =====
  // Seedance 2.0 has a three-way input mutex (T2V / I2V / multi-ref). Surface
  // it as a single radio above the per-channel pickers so users can't wire a
  // start frame AND a reference video on the same node — that combo is
  // rejected by Replicate. The selected mode also controls which downstream
  // canvas wires the executor will actually pass to /api/generate.
  const isSeedance = typeof model.slug === 'string' && model.slug === 'seedance-2.0'
  const seedanceMode: 'auto' | 't2v' | 'i2v' | 'multi-ref' =
    (params.input_mode as any) || 'auto'

  // Aspect ratio is per-model: some video models declare aspect_ratio in
  // their parameter_schema (Veo, Kling, Hailuo); others bake aspect into
  // resolution (e.g. Wan 2.5 with `1080p_landscape` / `_portrait`). We
  // surface a Select when present, otherwise show an inline note explaining
  // why the picker is missing.
  const hasAspect = Array.isArray(schema.aspect_ratio?.options) && schema.aspect_ratio.options.length > 0
  const aspectOptions: string[] = hasAspect ? schema.aspect_ratio.options : []
  const aspectDefault: string = schema.aspect_ratio?.default || aspectOptions[0] || '16:9'

  const durationOptions: number[] = schema.duration?.options || [5, 10]
  const resolutionOptions: string[] = schema.resolution?.options || ['720p']
  const hasAudio = !!schema.generate_audio
  const fpsOptions: number[] = schema.fps?.options || [24, 30]

  const audioDefault = typeof schema.generate_audio?.default === 'boolean' ? schema.generate_audio.default : true
  const audioOn = typeof params.generate_audio === 'boolean' ? params.generate_audio : audioDefault

  return (
    <>
      <ReferenceCapsChip slug={model.slug} />
      {isSeedance && (
        <>
          <Field
            label="Input mode"
            hint="Seedance allows ONE of these modes per run. The graph's connected handles must match: T2V uses prompt only; I2V uses in:start (+ optional in:end); multi-ref uses in:ref images / videos / audios."
          >
            <Select
              value={seedanceMode}
              options={[
                { value: 'auto', label: 'Auto (infer from wired handles)' },
                { value: 't2v', label: 'T2V — prompt only' },
                { value: 'i2v', label: 'I2V — start frame (+ optional end frame)' },
                { value: 'multi-ref', label: 'Multi-ref — images / videos / audios' },
              ]}
              onChange={(v) => update({ input_mode: String(v) })}
            />
          </Field>
          <SeedanceModeChip mode={seedanceMode} />
          <SeedanceMutexNote mode={seedanceMode} slug={model.slug} />
        </>
      )}
      <Field label="Duration">
        {isSeedance ? (
          <Stepper
            value={
              typeof params.duration === 'number'
                ? params.duration
                : schema.duration?.default ?? 5
            }
            min={-1}
            max={15}
            onChange={(v) => update({ duration: v })}
            suffix={params.duration === -1 ? 'auto' : 'seconds'}
          />
        ) : (
          <Select
            value={params.duration ?? schema.duration?.default ?? durationOptions[0]}
            options={durationOptions.map((d) => ({ value: d, label: `${d}s` }))}
            onChange={(v) => update({ duration: Number(v) })}
          />
        )}
      </Field>
      {hasAspect ? (
        <Field label="Aspect ratio">
          <Select
            value={params.aspect_ratio || aspectDefault}
            options={aspectOptions}
            onChange={(v) => update({ aspect_ratio: String(v) })}
          />
        </Field>
      ) : (
        <Field label="Aspect ratio">
          <p className="text-[11px] text-zinc-500 leading-relaxed bg-white/[0.02] ring-1 ring-white/[0.05] rounded-md px-2.5 py-2">
            Aspect ratio is set by Resolution for this model.
          </p>
        </Field>
      )}
      {schema.fps && (
        <Field label="FPS">
          <Select
            value={params.fps ?? schema.fps?.default ?? fpsOptions[0]}
            options={fpsOptions.map((f) => ({ value: f, label: `${f} fps` }))}
            onChange={(v) => update({ fps: Number(v) })}
          />
        </Field>
      )}
      <Field label="Resolution">
        <Select
          value={params.resolution ?? schema.resolution?.default ?? resolutionOptions[0]}
          options={resolutionOptions}
          onChange={(v) => update({ resolution: String(v) })}
        />
      </Field>
      <Field label="Seed" hint="Leave blank for a fresh result each run.">
        <input
          type="text"
          inputMode="numeric"
          value={params.seed ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              update({ seed: undefined })
              return
            }
            // Accept digits only; silently ignore other keystrokes so the
            // input doesn't flicker. Clamp to a non-negative 32-bit range.
            if (!/^\d+$/.test(raw)) return
            const n = Number(raw)
            if (!Number.isFinite(n) || n < 0) return
            update({ seed: Math.min(n, 2_147_483_647) })
          }}
          onBlur={(e) => {
            // Final coercion: empty stays empty, anything garbage clears.
            const raw = e.target.value.trim()
            if (raw === '') {
              if (params.seed !== undefined) update({ seed: undefined })
              return
            }
            const n = Number(raw)
            if (!Number.isFinite(n) || n < 0) update({ seed: undefined })
          }}
          placeholder="random"
          className="ss-input tabular-nums"
          aria-label="Seed (numeric)"
        />
      </Field>
      {hasAudio && (
        <Toggle
          label="Generate audio"
          hint="Adds a synced soundscape. Off renders silent."
          on={!!audioOn}
          onChange={(v) => update({ generate_audio: v })}
        />
      )}
      {schema.negative_prompt && (
        <Field
          label="Negative prompt"
          hint={
            (schema.negative_prompt.description as string | undefined) ||
            'What to exclude from the generation.'
          }
        >
          <TouchTextarea
            value={params.negative_prompt || ''}
            onChange={(v) => update({ negative_prompt: v })}
            rows={2}
            placeholder="e.g. blurry, low quality, text overlay"
          />
        </Field>
      )}
      <Toggle
        label="Lock seed"
        hint="Reuse this seed on every run to keep the result reproducible."
        on={!!params.lock_seed}
        onChange={(v) => update({ lock_seed: v })}
      />
    </>
  )
}

// =====================================================================
// Seedance mode summary chip. Sits under the input_mode selector and
// reflects which of the three mutually-exclusive modes the run will use.
// Mirrors the inputModeGroups in MODEL_SPECS for `seedance-2.0`.
// =====================================================================
// =====================================================================
// Reference-capacity chip. Shown at the top of the model param section so
// users can SEE the per-channel caps the spec enforces before they start
// wiring in:ref edges. Backed by MODEL_SPECS via getModelLimits — the DB
// parameter_schema doesn't carry these numbers today.
//
// Renders nothing if the spec has no caps at all (e.g. T2I models without
// reference-image support like flux-schnell, sdxl). Mention image-input
// caps even on image models because Replicate rejects requests that pass
// more refs than the spec allows (e.g. Seedream 14, Nano Banana Pro 14,
// FLUX 2 Pro 8).
// =====================================================================
function ReferenceCapsChip({ slug }: { slug?: string }) {
  const parts = describeReferenceCaps(slug)
  if (parts.length === 0) return null
  return (
    <div className="rounded-md bg-white/[0.02] ring-1 ring-white/[0.05] px-2.5 py-1.5 text-[10px] text-zinc-400 leading-relaxed">
      <span className="text-zinc-500 uppercase tracking-wider mr-1.5">refs cap</span>
      <span className="text-zinc-200">max {parts.join(' · ')}</span>
      <span className="text-zinc-600"> — extras are rejected by replicate</span>
    </div>
  )
}

// =====================================================================
// Mutex hint for Seedance: when the user picks an explicit input mode,
// list which channels become unusable. The graph-level enforcement (which
// edges to honor on a run) is owned by the preflight / executor; this is
// purely the "you can't have it both ways" reminder in the settings sheet.
// =====================================================================
function SeedanceMutexNote({
  mode,
  slug,
}: {
  mode: 'auto' | 't2v' | 'i2v' | 'multi-ref'
  slug?: string
}) {
  // Map the canvas-level mode label to the underlying spec param that
  // represents it. We then ask the bridge which other params are gated.
  const driverParam =
    mode === 'i2v' ? 'image' : mode === 'multi-ref' ? 'reference_images' : null
  if (!driverParam) return null
  const gated = Array.from(conflictsFor(slug, driverParam))
  if (gated.length === 0) return null
  return (
    <div className="-mt-1 text-[10px] text-zinc-500 leading-relaxed">
      gated by current mode: <span className="font-mono text-zinc-400">{gated.join(', ')}</span>
    </div>
  )
}

function SeedanceModeChip({ mode }: { mode: 'auto' | 't2v' | 'i2v' | 'multi-ref' }) {
  const label =
    mode === 't2v'
      ? 'T2V'
      : mode === 'i2v'
        ? 'I2V'
        : mode === 'multi-ref'
          ? 'Multi-ref'
          : 'Auto'
  const detail =
    mode === 't2v'
      ? 'prompt only — ignores in:start, in:end, in:ref'
      : mode === 'i2v'
        ? 'image + optional last frame — ignores in:ref'
        : mode === 'multi-ref'
          ? 'reference_images / videos / audios — ignores in:start and in:end'
          : 'mode picked from whichever input handle is wired'
  return (
    <div className="-mt-1.5 flex items-center gap-2 text-[10px]">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-skinny-yellow/[0.08] ring-1 ring-skinny-yellow/30 text-skinny-yellow uppercase tracking-wider font-medium">
        {label}
      </span>
      <span className="text-zinc-500 leading-relaxed">{detail}</span>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] text-zinc-400 mb-1.5">
        {label}
        {required && (
          <span className="text-rose-400/70 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

// =====================================================================
// Textarea variant that tracks user interaction so we can show a red
// ring once the field is touched + still empty + required.
//
// Behavior:
//   - `touched` flips on blur. Once true, it stays true so the red ring
//     persists if the user clears the field again.
//   - `invalid` re-evaluates on every keystroke, so typing immediately
//     clears the red ring (spec: "clears on input").
// =====================================================================
function TouchTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  required,
  maxChars,
  showCount,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  required?: boolean
  /** Soft cap. We show a counter + warn color when crossed but DON'T block
      typing — model-side truncation handles the actual enforcement. */
  maxChars?: number
  /** Render a `N/maxChars` counter under the textarea. */
  showCount?: boolean
}) {
  const [touched, setTouched] = useState(false)
  const invalid = !!(required && touched && !value.trim())
  const length = (value ?? '').length
  const overCap = maxChars !== undefined && length > maxChars
  const nearCap = maxChars !== undefined && length > maxChars * 0.9 && !overCap
  return (
    <div>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        rows={rows}
        placeholder={placeholder}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        className={cn(
          'ss-input resize-none',
          invalid && '!ring-rose-500/60 focus:!ring-rose-500/60',
          overCap && '!ring-amber-500/50 focus:!ring-amber-500/60',
        )}
      />
      {showCount && maxChars !== undefined && (
        <div
          className={cn(
            'mt-1 text-[10px] tabular-nums text-right',
            overCap ? 'text-amber-400' : nearCap ? 'text-amber-300/70' : 'text-zinc-500',
          )}
          aria-live="polite"
        >
          {length}/{maxChars}
          {overCap && <span className="ml-1.5 italic">— will be truncated</span>}
        </div>
      )}
    </div>
  )
}

// =====================================================================
// Stepper for integer params — − / value / +
//
// Reliability rules:
//   - Buttons clamp to [min, max] and disable at the boundary.
//   - Keyboard ArrowUp / ArrowDown step by `step` and clamp.
//   - Typing a number commits live but is clamped.
//   - Empty / NaN on blur coerces to `min` (no silent NaN persistence).
//   - Local draft string lets the user backspace mid-edit without the
//     value snapping back. Synced from prop on external changes.
// =====================================================================
function Stepper({
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
  const safeValue = Number.isFinite(value) ? clamp(Math.round(value)) : min
  const [draft, setDraft] = useState<string>(String(safeValue))

  // Sync draft when the canonical value changes from outside (e.g. button
  // press, external patch). Avoid clobbering the field while the user is
  // mid-edit — we only sync when the parsed draft no longer matches.
  useEffect(() => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed !== safeValue) setDraft(String(safeValue))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeValue])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      onChange(min)
      setDraft(String(min))
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      onChange(min)
      setDraft(String(min))
      return
    }
    const next = clamp(Math.round(n))
    onChange(next)
    setDraft(String(next))
  }

  const dec = () => onChange(clamp(safeValue - step))
  const inc = () => onChange(clamp(safeValue + step))

  const atMin = safeValue <= min
  const atMax = safeValue >= max

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-md ring-1 ring-white/[0.08] bg-white/[0.03] overflow-hidden">
        <button
          type="button"
          onClick={dec}
          disabled={atMin}
          aria-label={`decrease (min ${min})`}
          className={cn(
            'w-8 h-8 flex items-center justify-center text-zinc-300 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 focus-visible:ring-inset transition-colors',
            atMin && 'opacity-30 cursor-not-allowed hover:bg-transparent',
          )}
        >
          <Minus size={12} aria-hidden="true" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => {
            const raw = e.target.value
            // Allow empty during typing — user might be backspacing to retype.
            // Only digits get accepted; everything else is silently dropped so
            // the cursor doesn't flicker.
            if (raw === '' || /^\d+$/.test(raw)) {
              setDraft(raw)
              if (raw !== '') {
                const n = Number(raw)
                if (Number.isFinite(n)) onChange(clamp(n))
              }
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              inc()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              dec()
            } else if (e.key === 'Enter') {
              e.preventDefault()
              commit((e.target as HTMLInputElement).value)
            }
          }}
          className="w-10 h-8 text-center bg-transparent text-sm tabular-nums text-zinc-100 focus:outline-none border-x border-white/[0.06]"
          aria-label={`value (${min} to ${max})`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={safeValue}
          role="spinbutton"
        />
        <button
          type="button"
          onClick={inc}
          disabled={atMax}
          aria-label={`increase (max ${max})`}
          className={cn(
            'w-8 h-8 flex items-center justify-center text-zinc-300 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 focus-visible:ring-inset transition-colors',
            atMax && 'opacity-30 cursor-not-allowed hover:bg-transparent',
          )}
        >
          <Plus size={12} aria-hidden="true" />
        </button>
      </div>
      {suffix && <span className="text-[11px] text-zinc-500">{suffix}</span>}
    </div>
  )
}

function Select({
  value,
  options,
  onChange,
}: {
  value: any
  options: any[] | { value: any; label: string }[]
  onChange: (v: any) => void
}) {
  const opts = options.map((o) =>
    typeof o === 'object' && o !== null && 'value' in o ? o : { value: o, label: String(o) },
  )
  // HTML <select> only carries strings. To preserve the typed value (number
  // vs string) callers expect, look up the matching option by stringified
  // value and emit the original. Falls back to the raw string if no match.
  const stringValue = value === null || value === undefined ? '' : String(value)
  // Defensive: if the current value isn't in the option list (e.g. model
  // swap left a stale value behind), fall back to the first option so the
  // <select> doesn't render an empty/uncontrolled state.
  const matched = opts.find((o) => String(o.value) === stringValue)
  const renderedValue = matched ? stringValue : opts[0] ? String(opts[0].value) : ''
  return (
    <div className="relative">
      <select
        value={renderedValue}
        onChange={(e) => {
          const next = opts.find((o) => String(o.value) === e.target.value)
          onChange(next ? next.value : e.target.value)
        }}
        className="ss-input appearance-none pr-8 cursor-pointer min-h-[32px]"
      >
        {opts.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500"
        width="10"
        height="10"
        viewBox="0 0 12 12"
      >
        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function Toggle({
  label,
  hint,
  on,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  /** Always coerced to boolean — callers can pass `undefined`/falsy and the
      switch will render in the off position. */
  on: boolean | undefined | null
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  // Coerce explicitly so `undefined` doesn't break aria-checked / class logic.
  const value = !!on
  const toggle = useCallback(() => {
    if (disabled) return
    onChange(!value)
  }, [disabled, onChange, value])

  // 32x32 invisible hit-area wraps the visual switch so touch targets meet
  // the 44px minimum on mobile (32px hit + 8px padding from neighbors).
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {/* Plain span (not <label>) so a click on the text doesn't fire
            twice via implicit-form-control association. */}
        <span
          role="presentation"
          onClick={toggle}
          className={cn(
            'text-[11px] text-zinc-300 select-none',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          )}
        >
          {label}
        </span>
        {hint && (
          <p className="mt-0.5 text-[10px] text-zinc-500 leading-relaxed">{hint}</p>
        )}
      </div>
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        // Outer button is the 32x32 hit area; the visual track is centered.
        className={cn(
          'relative shrink-0 w-10 h-8 flex items-center justify-center rounded-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors duration-150 ease-out',
            value ? 'bg-skinny-yellow/80' : 'bg-zinc-700',
            !disabled && (value ? 'hover:bg-skinny-yellow' : 'hover:bg-zinc-600'),
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm',
              'transition-transform duration-200 ease-out will-change-transform',
              value ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
    </div>
  )
}

// =====================================================================
// Reference-image uploader.
// File drop / file pick → POST /api/upload-image (base64) → save returned
// public URL onto the node. Also accepts a pasted URL for convenience.
// =====================================================================
function ImageUploadField({
  imageUrl,
  visionContext,
  onPatch,
  canvas,
  getWhopHeaders,
}: {
  imageUrl?: string
  visionContext?: string
  /** Patch-based onChange so we can write imageUrl AND visionContext in
      separate ticks (URL upserts immediately; vision analysis lands async). */
  onPatch: (patch: Partial<CanvasNode['data']>) => void
  canvas: Canvas
  getWhopHeaders: () => Record<string, string>
}) {
  const getHeaders = getWhopHeaders
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // When imageUrl changes (upload / URL paste / picker), kick off a
  // background Gemini-vision analysis so the Director can SEE what's in
  // the image, not just the URL string. Server-side cache makes repeated
  // analysis of the same Skinny Hub asset a cheap lookup.
  const lastAnalyzedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!imageUrl) return
    if (lastAnalyzedRef.current === imageUrl) return
    if (visionContext) {
      lastAnalyzedRef.current = imageUrl
      return // already analyzed
    }
    let cancelled = false
    setAnalyzing(true)
    analyzeReferenceImage(imageUrl, { getHeaders })
      .then((res) => {
        if (cancelled) return
        if (res.ok && res.analysis) {
          onPatch({ visionContext: res.analysis })
          lastAnalyzedRef.current = imageUrl
        }
        // Failures are silent — the URL still works as a ref, vision just
        // isn't surfaced to the Director on this image.
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl])

  // Local shim so the rest of this component can keep using `onChange(url)`
  // semantics without rewriting every callsite.
  const onChange = useCallback(
    (url: string) => {
      // Setting a NEW url resets visionContext so the new image gets
      // re-analyzed. Clearing the url (empty string) clears both.
      onPatch({ imageUrl: url, visionContext: undefined })
    },
    [onPatch],
  )

  const upload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('only images are supported — drop a PNG, JPG, or WebP')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('image is too large — keep it under 10MB')
        return
      }
      setError(null)
      setUploading(true)
      try {
        const base64 = await fileToBase64(file)
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
        const data = await res.json()
        if (!res.ok || !data.url) throw new Error(data.error || `HTTP ${res.status}`)
        onChange(data.url)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
      } finally {
        setUploading(false)
      }
    },
    [getHeaders, onChange],
  )

  return (
    <Field label="Reference image">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) upload(f)
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative w-full aspect-square rounded-lg ring-1 cursor-pointer overflow-hidden transition-colors ${
          dragOver
            ? 'ring-skinny-yellow/60 bg-skinny-yellow/[0.05]'
            : 'ring-white/[0.08] bg-white/[0.02] hover:ring-white/[0.15] hover:bg-white/[0.04]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
        />
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 ring-1 ring-white/20 flex items-center justify-center hover:bg-black/90 hover:ring-rose-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 transition-colors"
              aria-label="Remove reference image"
              title="remove"
            >
              <X size={11} className="text-zinc-200" aria-hidden="true" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 px-4">
            {uploading ? (
              <>
                <Loader2 size={18} className="text-skinny-yellow animate-spin" aria-hidden="true" />
                <p className="text-[11px] text-zinc-400">uploading…</p>
              </>
            ) : (
              <>
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08] flex items-center justify-center">
                  <Upload size={14} className="text-zinc-400" aria-hidden="true" />
                </div>
                <p className="text-[11px] text-zinc-300">click or drop an image</p>
                <p className="text-[10px] text-zinc-600">PNG / JPG / WebP · up to 10MB</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Source affordance: dropzone above is the default, but users can
          also pull from their Skinny Hub library or another node on this
          canvas. Same tabbed picker the Director uses, just in single-pick
          mode. */}
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-skinny-yellow/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 text-[11px] text-zinc-300 transition-colors"
        >
          <ImageIcon size={11} className="text-skinny-yellow" aria-hidden="true" />
          browse hub or canvas
        </button>
      </div>

      {/* Vision context — what the Director sees about this image. Lets the
          user verify the AI knows what's in their reference + manually
          re-trigger analysis if the description is wrong / stale. */}
      {imageUrl && (
        <div className="mt-2 rounded-md bg-white/[0.02] ring-1 ring-white/[0.05] p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              vision context
            </span>
            {analyzing ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500" aria-live="polite">
                <Loader2 size={9} className="animate-spin" aria-hidden="true" />
                analyzing…
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Force a fresh analysis even if cached on the node.
                  lastAnalyzedRef.current = null
                  onPatch({ visionContext: undefined })
                }}
                className="text-[10px] text-zinc-500 hover:text-skinny-yellow focus-visible:outline-none focus-visible:underline focus-visible:text-skinny-yellow transition-colors"
                title="re-analyze the image"
              >
                {visionContext ? 're-analyze' : 'analyze'}
              </button>
            )}
          </div>
          {visionContext ? (
            <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-4">
              {visionContext}
            </p>
          ) : !analyzing ? (
            <p className="text-[10px] text-zinc-600 italic">
              the Director will see only the URL until analysis runs.
            </p>
          ) : null}
        </div>
      )}

      {/* URL fallback — small + secondary so the dropzone + picker lead. */}
      <details className="mt-2">
        <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 focus-visible:outline-none focus-visible:text-zinc-200 select-none">
          or paste a URL
        </summary>
        <input
          type="url"
          value={imageUrl || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="ss-input mt-2 text-xs"
        />
      </details>

      {error && (
        <p className="mt-2 text-[10px] text-rose-300/90 leading-relaxed" role="alert">
          {error}
        </p>
      )}

      {/* Reuse the Director's tabbed picker in single-pick mode. On attach
          we set imageUrl on the node and close. remainingSlots=1 caps
          selection at one pick (the picker still has Upload/URL/Hub/canvas
          tabs but won't keep accumulating). */}
      <AttachmentPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAttach={(att) => {
          if (att.url) {
            // Honor any pre-cached vision analysis the picker carried
            // through (Skinny Hub asset metadata, or an upstream canvas
            // node). Without this, onChange() would clear visionContext
            // and force a redundant /api/analyze-image roundtrip.
            if (att.visionContext) {
              onPatch({ imageUrl: att.url, visionContext: att.visionContext })
              lastAnalyzedRef.current = att.url
            } else {
              onChange(att.url)
            }
          }
          setPickerOpen(false)
        }}
        remainingSlots={1}
        canvas={canvas}
        getHeaders={getHeaders}
        initialTab="hub"
      />
    </Field>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip data:<mime>;base64, prefix
      const i = result.indexOf(',')
      resolve(i >= 0 ? result.slice(i + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// =====================================================================
// Skill picker — lists the user's saved_prompts. Picking one fills the
// node's prompt + label so the downstream model nodes see the skill text.
// When a skill is already selected, show a clear summary card with a
// "Use a different skill" link to swap.
// =====================================================================
interface SavedPrompt {
  id: string
  title: string
  prompt_text: string
  category?: string | null
}

function SkillPickerField({
  selectedId,
  onChange,
}: {
  selectedId?: string
  onChange: (skill: { id: string; title: string; prompt: string }) => void
}) {
  const getHeaders = useWhopHeaders()
  const [skills, setSkills] = useState<SavedPrompt[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/saved-prompts', { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d.prompts)) setSkills(d.prompts)
        else if (d.error) setError(d.error)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [getHeaders])

  const selectedSkill = useMemo(
    () => (selectedId && skills ? skills.find((s) => s.id === selectedId) : undefined),
    [selectedId, skills],
  )

  // Compact "selected" state — show the chosen skill clearly + offer a swap.
  if (selectedSkill && !browsing) {
    return (
      <Field label="Skill">
        <div className="rounded-lg ring-1 ring-skinny-yellow/30 bg-skinny-yellow/[0.04] p-3">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-md bg-skinny-yellow/15 ring-1 ring-skinny-yellow/30 flex items-center justify-center shrink-0">
              <Check size={12} className="text-skinny-yellow" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-zinc-100 truncate">{selectedSkill.title}</div>
              <div className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5">{selectedSkill.prompt_text}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBrowsing(true)}
            className="mt-2.5 text-[11px] text-skinny-yellow hover:text-skinny-yellow/80 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 rounded"
          >
            use a different skill
          </button>
        </div>
      </Field>
    )
  }

  return (
    <Field label="Skill">
      <div className="rounded-lg ring-1 ring-white/[0.06] bg-white/[0.02] max-h-64 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-6 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
            <Loader2 size={11} className="animate-spin" />
            Loading skills…
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-[11px] text-rose-400">{error}</div>
        ) : !skills || skills.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-zinc-500 leading-relaxed">
            <Sparkles size={14} className="text-zinc-600 mx-auto mb-1.5" aria-hidden="true" />
            no saved skills yet — save one from chat by typing
            <span className="font-mono text-zinc-400"> @ </span>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {skills.map((s) => {
              const active = s.id === selectedId
              return (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      onChange({ id: s.id, title: s.title, prompt: s.prompt_text })
                      setBrowsing(false)
                    }}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors focus:outline-none focus:bg-white/[0.05] ${
                      active ? 'bg-skinny-yellow/[0.06]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <Sparkles
                      size={11}
                      className={active ? 'text-skinny-yellow mt-0.5' : 'text-zinc-500 mt-0.5'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-100 truncate">{s.title}</div>
                      <div className="text-[10px] text-zinc-500 line-clamp-2">{s.prompt_text}</div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Field>
  )
}

/* =========================================================================
 * Model picker — lets the user swap which model an image-gen / video-gen
 * node uses. Filters the registry by category (image-gen → image models,
 * video-gen → video models). Picking a different model resets params in
 * the caller because the new schema may not accept the old fields.
 * ======================================================================= */
function ModelPickerField({
  currentSlug,
  category,
  models,
  onPick,
}: {
  currentSlug?: string
  category: 'image' | 'video'
  models: StudioModelLite[]
  onPick: (m: StudioModelLite) => void
}) {
  const compatible = useMemo(
    () => models.filter((m) => m.category === category),
    [models, category],
  )
  const [open, setOpen] = useState(false)
  const current = compatible.find((m) => m.slug === currentSlug)

  return (
    <Field label="Model">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current ? `swap from ${current.name}` : 'choose a model'}
        className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-skinny-yellow/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-md bg-black/40 ring-1 ring-white/[0.05] flex items-center justify-center shrink-0">
          {category === 'video' ? (
            <Film size={14} className="text-zinc-400" aria-hidden="true" />
          ) : (
            <ImageIcon size={14} className="text-zinc-400" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-zinc-100 truncate">
            {current?.name || 'choose a model…'}
          </div>
          <div className="text-[10px] text-zinc-500 truncate font-mono">
            {current?.slug || `${compatible.length} ${category} model${compatible.length === 1 ? '' : 's'} available`}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {current && (
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 group-hover:text-skinny-yellow transition-colors">
              swap
            </span>
          )}
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={cn(
              'text-zinc-400 group-hover:text-skinny-yellow transition-transform',
              open && 'rotate-180',
            )}
          />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            <ul
              role="listbox"
              className="mt-2 rounded-lg ring-1 ring-white/[0.06] bg-zinc-950/95 max-h-64 overflow-y-auto divide-y divide-white/[0.04]"
            >
              {compatible.length === 0 && (
                <li className="px-3 py-4 text-[11px] text-zinc-500 text-center">
                  No {category} models in the registry yet.
                </li>
              )}
              {compatible.map((m) => {
                const active = m.slug === currentSlug
                return (
                  <li key={m.slug}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onPick(m)
                        setOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                        active ? 'bg-skinny-yellow/[0.08]' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                        {category === 'video' ? (
                          <Film size={11} className="text-zinc-400" />
                        ) : (
                          <ImageIcon size={11} className="text-zinc-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-zinc-100 truncate flex items-center gap-1.5">
                          {m.name}
                          {active && (
                            <Check size={11} className="text-skinny-yellow shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate font-mono">
                          {m.slug}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </Field>
  )
}
