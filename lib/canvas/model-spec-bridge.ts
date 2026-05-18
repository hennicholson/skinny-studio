// Model spec bridge.
//
// `studio_models` is the database row that ships parameter_schema (a JSONB)
// to the UI; `MODEL_SPECS` in lib/orchestrator/model-specs.ts is the
// authoritative TypeScript spec the orchestrator + executor rely on. The two
// share a `slug` (DB) / `id` (spec) join key. Structural metadata that the
// schema-driven NodeSettingsModal can't (yet) read out of parameter_schema —
// maxReferenceImages, maxReferenceVideos, maxReferenceAudios, maxPromptChars,
// inputModeGroups, imageInputParam — lives only in MODEL_SPECS.
//
// This module is a thin, side-effect-free lookup so any client-side surface
// (currently NodeSettingsModal) can pull the structural caps without
// duplicating them or reaching across module boundaries it shouldn't.
//
// Pure functions only; never mutate MODEL_SPECS.

import { MODEL_SPECS, type ModelSpec } from '@/lib/orchestrator/model-specs'

const BY_SLUG = new Map<string, ModelSpec>()
for (const spec of MODEL_SPECS) BY_SLUG.set(spec.id, spec)

/**
 * Look up the full ModelSpec for a `studio_models.slug` value.
 *
 * Returns undefined if the slug doesn't match any spec — callers should
 * treat that as "no extra constraints known" and fall back to whatever the
 * parameter_schema JSONB already provides.
 */
export function getModelSpec(slug: string | undefined | null): ModelSpec | undefined {
  if (!slug) return undefined
  return BY_SLUG.get(slug)
}

/**
 * The subset of ModelSpec the canvas UI cares about. Keeping this narrow
 * means the modal can shape its own guardrails without importing the spec
 * type or worrying about which capability flags are set.
 */
export interface ModelLimits {
  /** Cap on reference images delivered to `imageInputParam`. */
  maxReferenceImages?: number
  /** Seedance-style cap on reference videos. */
  maxReferenceVideos?: number
  /** Seedance-style cap on reference audios. */
  maxReferenceAudios?: number
  /** Hard cap on prompt char length (Seedance: 2500). */
  maxPromptChars?: number
  /** Pairs of param names that cannot coexist on the same run. */
  inputModeGroups?: string[][]
  /** Replicate param name for the reference-image array (e.g. 'image_input'). */
  imageInputParam?: string
}

/**
 * Pull the canvas-relevant caps for a given studio_models.slug.
 *
 * Returns an empty object — NOT undefined — when no spec matches, so
 * callers can destructure without optional chaining everywhere.
 */
export function getModelLimits(slug: string | undefined | null): ModelLimits {
  const spec = getModelSpec(slug)
  if (!spec) return {}
  return {
    maxReferenceImages: spec.maxReferenceImages,
    maxReferenceVideos: spec.maxReferenceVideos,
    maxReferenceAudios: spec.maxReferenceAudios,
    maxPromptChars: spec.maxPromptChars,
    inputModeGroups: spec.inputModeGroups,
    imageInputParam: spec.imageInputParam,
  }
}

/**
 * Convenience: when the modal needs to summarize a model's reference
 * capacity in a single chip (e.g. "max 9 imgs · 3 vids · 3 auds"), this
 * returns the human-readable parts already filtered to non-zero values.
 */
export function describeReferenceCaps(slug: string | undefined | null): string[] {
  const { maxReferenceImages, maxReferenceVideos, maxReferenceAudios } = getModelLimits(slug)
  const parts: string[] = []
  if (maxReferenceImages) parts.push(`${maxReferenceImages} image${maxReferenceImages === 1 ? '' : 's'}`)
  if (maxReferenceVideos) parts.push(`${maxReferenceVideos} video${maxReferenceVideos === 1 ? '' : 's'}`)
  if (maxReferenceAudios) parts.push(`${maxReferenceAudios} audio${maxReferenceAudios === 1 ? '' : 's'}`)
  return parts
}

/**
 * Returns the set of param names that conflict with a given param under
 * `inputModeGroups`. E.g. for Seedance, `conflictsFor('image')` returns
 * `Set(['reference_images', 'reference_videos', 'reference_audios'])`.
 *
 * The UI uses this to gray out / disable inputs that would conflict with a
 * currently-set param so the user can't accidentally produce a request
 * Replicate will reject.
 */
export function conflictsFor(
  slug: string | undefined | null,
  paramName: string,
): Set<string> {
  const conflicts = new Set<string>()
  const groups = getModelLimits(slug).inputModeGroups
  if (!groups) return conflicts
  for (const group of groups) {
    if (group.includes(paramName)) {
      for (const other of group) if (other !== paramName) conflicts.add(other)
    }
  }
  return conflicts
}
