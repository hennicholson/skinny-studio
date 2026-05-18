-- Seedance 2.0 — register as a first-class Skinny video model.
--
-- ByteDance's flagship multi-modal video model. Three input modes:
--   A. T2V                — prompt only.
--   B. I2V / first→last   — `image` (+ optional `last_frame_image`).
--   C. Multi-ref          — `reference_images` (up to 9), `reference_videos`
--                           (up to 3, total ≤15s), `reference_audios`
--                           (up to 3, total ≤15s, requires at least one
--                           reference_image OR reference_video).
--
-- Modes B and C are mutually exclusive on the same run — the canvas
-- validator and the NodeSettingsModal enforce this.
--
-- Pricing matrix (per second of OUTPUT video, in cents):
--   resolution     non-video-in   video-in
--   480p           Replicate 8c    Replicate 10c
--                  list      10c   list      13c
--   720p           Replicate 18c   Replicate 22c
--                  list      24c   list      29c
--   1080p          Replicate 45c   Replicate 55c
--                  list      60c   list      75c
--
-- Variant detection (executor-side): if `reference_videos.length > 0`,
-- use the video-in row.
--
-- Seconds = duration === -1 ? 8 : duration. (-1 = "intelligent duration";
-- we budget 8s conservatively.)
--
-- Worst case 15s × 75¢/s = $11.25 per single gen — the system prompt
-- WARNs whenever expected cost > $1.

insert into public.studio_models (
  id,
  slug,
  name,
  replicate_model,
  category,
  pricing_type,
  cost_per_run_cents,
  cost_per_second_cents,
  resolution_multipliers,
  parameter_schema,
  is_active,
  created_at
)
values (
  gen_random_uuid(),
  'seedance-2.0',
  'Seedance 2.0',
  'bytedance/seedance-2.0',
  'video',
  'per_second',
  0,  -- per-second model; cost_per_run_cents is unused (column is NOT NULL → 0, matching kling/luma/wan)
  -- Base list price = 720p non-video-in (24c/s). Resolution multipliers + the
  -- generate_audio.pricing block (kept null here — Seedance bills the same
  -- regardless of audio toggle, unlike Veo) handle the rest. The video-in
  -- premium is encoded in `replicate_cost_per_second_cents_video_in` below
  -- via the parameter_schema since the studio_models table doesn't have a
  -- column for it yet — the executor reads it out of `parameter_schema._pricing`.
  24,
  -- Resolution multipliers relative to the 720p list price (24c/s):
  --   480p / 24 = 0.4167  → ceil(24 * 0.4167 * dur) = 10c/s baseline
  --   720p / 24 = 1.0
  --   1080p / 24 = 2.5     → 60c/s baseline
  -- Server-side calculateVideoCost() uses these to compute the per-second
  -- cost; the executor's variant detection layer applies the video-in
  -- premium on top by reading parameter_schema._pricing.
  '{
    "480p": 0.4167,
    "720p": 1.0,
    "1080p": 2.5
  }'::jsonb,
  -- Full parameter schema. The Director and the NodeSettingsModal both read
  -- this to render fields and validate combinations. Mirrors what's in
  -- lib/orchestrator/model-specs.ts so the chat-side and the canvas-side
  -- agree.
  '{
    "prompt": {
      "type": "string",
      "required": true,
      "max_chars": 2500,
      "description": "Text prompt. Max 2500 chars. May embed [Image1]/[Audio1]/[Video1] tokens that resolve to entries in the matching reference_* arrays. Dialogue uses double-quotes; supports SFX + BGM cues when generate_audio is on."
    },
    "seed": {
      "type": "number",
      "nullable": true,
      "description": "Reproducibility seed."
    },
    "image": {
      "type": "image",
      "nullable": true,
      "description": "First frame for I2V. Mutually exclusive with reference_images / reference_videos / reference_audios."
    },
    "last_frame_image": {
      "type": "image",
      "nullable": true,
      "requires": ["image"],
      "description": "End frame for first→last interpolation. Requires image to also be set."
    },
    "duration": {
      "type": "number",
      "default": 5,
      "min": -1,
      "max": 15,
      "description": "Length in seconds. -1 = intelligent duration."
    },
    "resolution": {
      "type": "enum",
      "options": ["480p", "720p", "1080p"],
      "default": "720p"
    },
    "aspect_ratio": {
      "type": "enum",
      "options": ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21", "adaptive"],
      "default": "16:9"
    },
    "generate_audio": {
      "type": "boolean",
      "default": true,
      "description": "Generate synced audio (dialogue / SFX / BGM)."
    },
    "reference_images": {
      "type": "array",
      "item_type": "image",
      "max_items": 9,
      "mutually_exclusive_with": ["image", "last_frame_image"],
      "description": "1-9 reference images (character/style/composition). Resolved as [Image1]…[ImageN] in the prompt."
    },
    "reference_videos": {
      "type": "array",
      "item_type": "string",
      "max_items": 3,
      "max_total_seconds": 15,
      "mutually_exclusive_with": ["image", "last_frame_image"],
      "description": "1-3 reference videos (motion transfer / style / editing). Total ≤15s. Triggers the higher video-in pricing tier."
    },
    "reference_audios": {
      "type": "array",
      "item_type": "string",
      "max_items": 3,
      "max_total_seconds": 15,
      "requires_any": ["reference_images", "reference_videos"],
      "mutually_exclusive_with": ["image", "last_frame_image"],
      "description": "1-3 reference audios for audio-driven generation + lip-sync."
    },
    "_pricing": {
      "intelligent_duration_seconds": 8,
      "per_resolution": {
        "480p": {
          "replicate_cost_per_second_cents": 8,
          "replicate_cost_per_second_cents_video_in": 10,
          "list_cost_per_second_cents": 10,
          "list_cost_per_second_cents_video_in": 13
        },
        "720p": {
          "replicate_cost_per_second_cents": 18,
          "replicate_cost_per_second_cents_video_in": 22,
          "list_cost_per_second_cents": 24,
          "list_cost_per_second_cents_video_in": 29
        },
        "1080p": {
          "replicate_cost_per_second_cents": 45,
          "replicate_cost_per_second_cents_video_in": 55,
          "list_cost_per_second_cents": 60,
          "list_cost_per_second_cents_video_in": 75
        }
      }
    },
    "_input_mode_groups": [
      ["image", "reference_images"],
      ["image", "reference_videos"],
      ["image", "reference_audios"],
      ["last_frame_image", "reference_images"],
      ["last_frame_image", "reference_videos"],
      ["last_frame_image", "reference_audios"]
    ]
  }'::jsonb,
  true,
  now()
)
on conflict (slug) do update set
  name                  = excluded.name,
  replicate_model       = excluded.replicate_model,
  category              = excluded.category,
  pricing_type          = excluded.pricing_type,
  cost_per_run_cents    = excluded.cost_per_run_cents,
  cost_per_second_cents = excluded.cost_per_second_cents,
  resolution_multipliers = excluded.resolution_multipliers,
  parameter_schema      = excluded.parameter_schema,
  is_active             = excluded.is_active;
