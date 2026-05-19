-- Seedance 2.0 — Tier B list pricing (~1.8x raw Replicate cost).
--
-- Replicate raw costs (per second of output video, May 2026):
--   resolution     non_video_in   video_in
--   480p           $0.08          $0.10
--   720p           $0.18          $0.22
--   1080p          $0.45          $0.55
--
-- After Whop platform fee (~3%) + Stripe processing (~3% + $0.30) take ~6-8%
-- off every credit purchase, a 2x list markup nets ~1.85x effective. Tier B
-- sits at ~1.8x raw which targets ~78-87% gross margin after fees — covers
-- storage/bandwidth for outputs + a profitable spread.
--
-- Tier B list pricing (per second of output video, in cents):
--   resolution     non_video_in   video_in
--   480p           15c            18c
--   720p           32c            40c
--   1080p          80c            99c
--
-- Worst-case single gen: 15s × 1080p × video_in = $14.85.
--
-- This migration also FIXES the duration_options / resolution_options bug:
-- the previous migration left these as `[]` (empty array). The /api/generate
-- route's fallback `durationParam?.options || model.duration_options || [5]`
-- treated `[]` as truthy → `durationOptions = []` → no enum to validate
-- against → `effectiveDuration = undefined` → `Math.ceil(rate × undefined)
-- = NaN` → stored as 0. Result: every Seedance gen was being billed $0.
--
-- The code fix (lib/video-pricing.ts) treats `[]` as "no enum" via a
-- nonEmptyArray helper. We also NULL out the columns here so future readers
-- of the row see the range-based schema as the authoritative source.

update public.studio_models
set
  -- 720p non-video-in baseline = Tier B list rate. Used by legacy callers
  -- that don't read parameter_schema._pricing.
  cost_per_second_cents = 32,
  -- Multipliers relative to the 720p baseline (non-video-in row only):
  --   480p / 32 = 0.46875  → 15c/s
  --   720p / 32 = 1.0      → 32c/s
  --   1080p / 32 = 2.5     → 80c/s
  -- Video-in pricing is NOT expressible as a single multiplier (the ratios
  -- differ at each resolution) — callers must read _pricing.per_resolution
  -- to get the video-in rate. The shared lib/video-pricing.resolveVideoCost
  -- helper does this automatically.
  resolution_multipliers = '{
    "480p": 0.46875,
    "720p": 1.0,
    "1080p": 2.5
  }'::jsonb,
  -- Clear legacy enum columns. Seedance uses range-based duration (min:-1,
  -- max:15) and the resolution enum lives in parameter_schema.resolution.
  -- (Columns are jsonb; the code's nonEmptyArray() helper now treats an
  -- empty jsonb array as "no enum" too, so this is belt-and-suspenders.)
  duration_options = '[]'::jsonb,
  resolution_options = '[]'::jsonb,
  parameter_schema = jsonb_set(
    parameter_schema,
    '{_pricing}',
    '{
      "intelligent_duration_seconds": 8,
      "per_resolution": {
        "480p": {
          "replicate_cost_per_second_cents": 8,
          "replicate_cost_per_second_cents_video_in": 10,
          "list_cost_per_second_cents": 15,
          "list_cost_per_second_cents_video_in": 18
        },
        "720p": {
          "replicate_cost_per_second_cents": 18,
          "replicate_cost_per_second_cents_video_in": 22,
          "list_cost_per_second_cents": 32,
          "list_cost_per_second_cents_video_in": 40
        },
        "1080p": {
          "replicate_cost_per_second_cents": 45,
          "replicate_cost_per_second_cents_video_in": 55,
          "list_cost_per_second_cents": 80,
          "list_cost_per_second_cents_video_in": 99
        }
      }
    }'::jsonb
  )
where slug = 'seedance-2.0';
