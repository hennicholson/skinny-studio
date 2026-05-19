// Shared video-cost resolution. Replaces the duplicated calculateVideoCost()
// in /api/generate + /api/estimate-cost + lib/canvas/cost.ts so all three
// agree byte-for-byte on what a single video gen will cost.
//
// Key behaviors:
//   - Range-based duration (Seedance: {min:-1, max:15, default:5}) works the
//     same as enum-based (Veo: {options:[5,8]}). Falls through gracefully if
//     the studio_models.duration_options column is an empty array (which the
//     legacy fallback `||` was treating as truthy → producing `undefined`
//     duration → NaN cost → $0 charged).
//   - `duration: -1` (Seedance "intelligent duration") maps to
//     parameter_schema._pricing.intelligent_duration_seconds (default 8).
//   - Per-resolution `_pricing` matrix takes precedence over the legacy
//     cost_per_second_cents × resolution_multipliers product, so Seedance's
//     video-in premium row is actually billed (matrix row keys:
//     list_cost_per_second_cents, list_cost_per_second_cents_video_in).
//   - Veo audio-on/off variant still works via parameter_schema.generate_audio.pricing.
//
// Output is deterministic — callers can compare resolved values across
// pre-charge, post-debit, and dashboard preview without drift.

export interface StudioModelRow {
  slug: string
  pricing_type: 'per_run' | 'per_second'
  cost_per_run_cents?: number | null
  cost_per_second_cents?: number | null
  resolution_multipliers?: Record<string, number> | null
  duration_options?: number[] | null
  resolution_options?: string[] | null
  parameter_schema?: any
}

export interface VideoCostInput {
  model: StudioModelRow
  /** Top-level duration from the request, or `params.duration`. `-1` = intelligent. */
  duration?: number | null
  resolution?: string | null
  /** Veo-only: defaults to schema default (true). */
  generateAudio?: boolean
  /** Seedance: when the user has reference_videos wired, the video-in price tier applies. */
  hasReferenceVideos?: boolean
}

export interface ResolvedVideoCost {
  costCents: number
  effectiveDuration: number
  effectiveResolution: string
  effectiveGenerateAudio: boolean
  /** What we actually used as cents/second after all overrides. Useful for the
   *  cost-breakdown blob written to ledger metadata. */
  rateCentsPerSecond: number
  videoInPremiumApplied: boolean
  /** Where the rate came from. Helps debug pricing drift. */
  source: 'pricing-matrix' | 'audio-pricing' | 'legacy-multiplier'
}

/** Treat empty arrays as "no enum" — fixes the `[] || fallback` truthy bug. */
function nonEmptyArray<T>(v: T[] | null | undefined): T[] | null {
  if (Array.isArray(v) && v.length > 0) return v
  return null
}

export function resolveVideoCost(input: VideoCostInput): ResolvedVideoCost {
  const { model, duration, resolution, generateAudio, hasReferenceVideos } = input
  const schema = (model.parameter_schema || {}) as any
  const dParam = schema.duration
  const rParam = schema.resolution
  const aParam = schema.generate_audio

  // ---- Duration --------------------------------------------------------
  const enumDurations =
    nonEmptyArray<number>(dParam?.options) ?? nonEmptyArray<number>(model.duration_options)
  const dDefault =
    typeof dParam?.default === 'number' ? dParam.default : enumDurations?.[0] ?? 5

  let effDuration: number = duration ?? dDefault

  if (effDuration === -1) {
    // Seedance "intelligent duration" sentinel → conservative budget.
    effDuration =
      typeof schema._pricing?.intelligent_duration_seconds === 'number'
        ? schema._pricing.intelligent_duration_seconds
        : 8
  } else if (enumDurations) {
    if (!enumDurations.includes(effDuration)) effDuration = enumDurations[0]
  } else if (typeof dParam?.min === 'number' || typeof dParam?.max === 'number') {
    const rawMin = typeof dParam?.min === 'number' ? dParam.min : 1
    const rawMax = typeof dParam?.max === 'number' ? dParam.max : 15
    const minClamp = rawMin === -1 ? 1 : rawMin
    const n = Number(effDuration)
    effDuration = Math.max(minClamp, Math.min(rawMax, Number.isFinite(n) ? n : dDefault))
  }
  if (!Number.isFinite(effDuration) || effDuration < 0) effDuration = dDefault

  // ---- Resolution ------------------------------------------------------
  const enumResolutions =
    nonEmptyArray<string>(rParam?.options) ?? nonEmptyArray<string>(model.resolution_options)
  const rDefault: string =
    typeof rParam?.default === 'string' ? rParam.default : enumResolutions?.[0] ?? '720p'
  let effResolution: string = resolution ?? rDefault
  if (enumResolutions && !enumResolutions.includes(effResolution)) {
    effResolution = enumResolutions[0]
  }

  // ---- Audio (Veo) -----------------------------------------------------
  const audioDefault = typeof aParam?.default === 'boolean' ? aParam.default : true
  const effGenAudio =
    typeof generateAudio === 'boolean' ? generateAudio : audioDefault

  // ---- Rate selection --------------------------------------------------
  let ratePerSecond: number | null = null
  let videoInApplied = false
  let source: ResolvedVideoCost['source'] = 'legacy-multiplier'

  const matrix = schema._pricing?.per_resolution as Record<string, any> | undefined
  const row = matrix?.[effResolution]
  if (row) {
    const standard = Number(row.list_cost_per_second_cents)
    const premium = Number(row.list_cost_per_second_cents_video_in)
    const wantPremium = !!hasReferenceVideos && Number.isFinite(premium) && premium > 0
    const cents = wantPremium ? premium : standard
    if (Number.isFinite(cents) && cents > 0) {
      ratePerSecond = cents
      videoInApplied = wantPremium && premium !== standard
      source = 'pricing-matrix'
    }
  }

  if (ratePerSecond == null && aParam?.pricing) {
    const cents = effGenAudio
      ? Number(aParam.pricing.with_audio_cents_per_second)
      : Number(aParam.pricing.without_audio_cents_per_second)
    if (Number.isFinite(cents) && cents > 0) {
      ratePerSecond = cents
      source = 'audio-pricing'
    }
  }

  if (ratePerSecond == null) {
    const base = Number(model.cost_per_second_cents) || 0
    const mult = Number(model.resolution_multipliers?.[effResolution]) || 1.0
    ratePerSecond = base * mult
    source = 'legacy-multiplier'
  }

  const costCents = Math.max(0, Math.ceil(ratePerSecond * effDuration))

  return {
    costCents,
    effectiveDuration: effDuration,
    effectiveResolution: effResolution,
    effectiveGenerateAudio: effGenAudio,
    rateCentsPerSecond: ratePerSecond,
    videoInPremiumApplied: videoInApplied,
    source,
  }
}

/** Detect "user wired one or more reference videos" from a params blob. */
export function detectHasReferenceVideos(params: any): boolean {
  if (!params || typeof params !== 'object') return false
  const v = (params as any).reference_videos
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'string') return v.length > 0
  return !!v
}
