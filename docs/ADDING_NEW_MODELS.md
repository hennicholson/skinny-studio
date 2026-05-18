# Adding New Models to Skinny Studio

This guide explains how to properly add a new AI model to the Skinny Studio system. Follow all steps to ensure the model works correctly with pricing, the orchestrator, reference images, and the UI.

---

## Quick Checklist

When adding a new model, update these 5 files:

| # | File | Purpose |
|---|------|---------|
| 1 | **Supabase `studio_models` table** | Database record with pricing |
| 2 | `/lib/orchestrator/model-specs.ts` | Orchestrator capabilities & parameters |
| 3 | `/app/api/generate/route.ts` | Image routing (if model accepts images) |
| 4 | `/lib/types.ts` | UI model selector list |
| 5 | `/lib/orchestrator/system-prompt.ts` | AI pricing knowledge |

---

## Step 1: Add to Database (`studio_models` table)

Insert the model into Supabase. This is where pricing is stored.

```sql
INSERT INTO studio_models (
  slug,
  name,
  replicate_model,
  category,
  description,
  is_active,
  cost_per_run_cents,
  pricing_type,
  default_parameters,
  parameter_schema
) VALUES (
  'model-slug',                    -- URL-safe identifier (e.g., 'qwen-image-2512')
  'Model Display Name',            -- Human-readable name
  'owner/model-name',              -- Replicate model ID
  'image',                         -- Category: 'image', 'video', 'audio'
  'Description of the model',      -- Brief description
  true,                            -- is_active
  6,                               -- cost in CENTS (e.g., 6 = $0.06)
  'flat',                          -- 'flat' for images, 'per_second' for video
  '{"key": "value"}'::jsonb,       -- Default parameters (JSON)
  '{"param": {...}}'::jsonb        -- Parameter schema (JSON)
);
```

### Pricing Types
- **`flat`** - Fixed cost per generation (images)
- **`per_second`** - Cost per second of output (videos)

### For Video Models
Add these extra fields:
```sql
cost_per_second_cents,             -- Base cost per second
duration_options,                  -- Array: [5, 10] seconds
resolution_options,                -- Array: ['720p', '1080p']
resolution_multipliers             -- JSON: {"720p": 1.0, "1080p": 1.5}
```

---

## Step 2: Add to Model Specs (`/lib/orchestrator/model-specs.ts`)

This tells the orchestrator what the model can do.

```typescript
{
  id: 'model-slug',                          // Must match database slug
  name: 'Model Display Name',
  replicateId: 'owner/model-name',           // Replicate model ID
  type: 'text-to-image',                     // 'text-to-image', 'image-to-image', 'video'
  capabilities: {
    textRendering: true,                     // Can render text in images
    supportsReferenceImages: true,           // Accepts reference/input images
    supportsStartingFrame: false,            // For video: accepts start frame
    supportsLastFrame: false,                // For video: accepts end frame
    multipleReferences: false,               // Accepts multiple reference images
  },
  imageInputParam: 'image',                  // Replicate param name for images
  maxReferenceImages: 1,                     // Max number of reference images
  params: {
    required: [
      {
        name: 'prompt',
        type: 'string',
        description: 'Text prompt for generation',
        required: true,
      },
    ],
    optional: [
      // Add all optional parameters from Replicate schema
      {
        name: 'aspect_ratio',
        type: 'enum',
        description: 'Aspect ratio',
        options: ['1:1', '16:9', '9:16'],
        default: '1:1',
      },
      {
        name: 'guidance',
        type: 'number',
        description: 'Guidance scale',
        default: 4,
        range: { min: 0, max: 10 },
      },
    ],
  },
  description: 'Brief description for the orchestrator',
  whenToUse: 'When to recommend this model',
  tips: [
    'Helpful tip 1',
    'Helpful tip 2',
  ],
},
```

### Parameter Types
- `string` - Text input
- `number` - Numeric value (add `range: { min, max }`)
- `enum` - Select from options (add `options: [...]`)
- `boolean` - True/false
- `image` - Image input

### Key Capabilities
| Capability | Description |
|------------|-------------|
| `supportsReferenceImages` | Model accepts reference images for style/content |
| `supportsStartingFrame` | Video model accepts first frame image |
| `supportsLastFrame` | Video model accepts last frame (interpolation) |
| `multipleReferences` | Can accept multiple reference images |

---

## Step 3: Add Image Routing (`/app/api/generate/route.ts`)

If the model accepts images, add routing logic around **line 440-470**.

Find the reference images section and add your model:

```typescript
// ===== REFERENCE IMAGES =====
if (byPurpose.reference.length > 0) {
  // ... existing models ...

  // YOUR NEW MODEL: Add routing for reference images
  else if (model === 'your-model-slug') {
    // Single image (string):
    input.image = byPurpose.reference[0]

    // OR multiple images (array):
    input.input_images = byPurpose.reference
  }
}
```

### Common Image Parameter Names
| Model Type | Parameter | Format |
|------------|-----------|--------|
| FLUX 2 | `input_images` | Array of URLs |
| Seedream | `image_input` | Array of URLs |
| Nano Banana | `image_input` | Array of URLs |
| Qwen Image 2512 | `image` | Single URL string |
| Veo (R2V) | `reference_images` | Array of URLs |

### For Video Models (Starting Frame)
Add to the starting frame section (~line 472-495):
```typescript
if (byPurpose.starting_frame.length > 0) {
  // YOUR VIDEO MODEL
  else if (model === 'your-video-model') {
    input.start_image = byPurpose.starting_frame[0]
  }
}
```

---

## Step 4: Add to UI Model List (`/lib/types.ts`)

Add to the `mockModels` array (around line 1575+) so it appears in the model selector.

```typescript
{
  id: 'model-slug',                          // Must match database slug
  name: 'Model Display Name',
  provider: 'Company Name',                  // e.g., 'Qwen', 'Google', 'Black Forest Labs'
  description: 'Short description for UI',
  category: 'image',                         // 'image', 'video', 'chat'
  tags: ['high-quality', 'fast', 'i2i'],    // Tags shown in selector
  capabilities: { speed: 'medium', quality: 'high' },
  replicateId: 'owner/model-name'
},
```

### Where to Add
- **Image models**: After other image models, before `// === VIDEO MODELS ===`
- **Video models**: In the video section
- **Chat models**: At the top with other chat modes

---

## Step 5: Add to System Prompt (`/lib/orchestrator/system-prompt.ts`)

The AI needs to know about the model and its pricing to show cost estimates.

### 5a. Add to Model List (line ~370)
```typescript
Available model IDs:
**Image**: seedream-4.5, flux-2-pro, ..., YOUR-MODEL-SLUG, ...
```

### 5b. Add Pricing Info (line ~373-378)
```typescript
### Image Model Pricing:
- Most image models: 7¢/image
- Your Model Name: X¢/image (brief note)
```

### For Video Models
Add to the video pricing table:
```typescript
| Your Model | X¢/s | Y¢/s |
```

---

## Example: Adding a New Model

Let's say you're adding `acme/super-gen` at $0.08 per image with image-to-image support.

### Given Info from User
```
Replicate: acme/super-gen
Cost: $0.08
Schema: {
  "prompt": { "type": "string", "required": true },
  "image": { "type": "string", "format": "uri", "description": "Input image" },
  "strength": { "type": "number", "default": 0.8 },
  "aspect_ratio": { "enum": ["1:1", "16:9", "9:16"] }
}
```

### Step 1: Database
```sql
INSERT INTO studio_models (slug, name, replicate_model, category, is_active, cost_per_run_cents, pricing_type)
VALUES ('super-gen', 'Super Gen', 'acme/super-gen', 'image', true, 8, 'flat');
```

### Step 2: Model Specs
```typescript
{
  id: 'super-gen',
  name: 'Super Gen',
  replicateId: 'acme/super-gen',
  type: 'text-to-image',
  capabilities: { supportsReferenceImages: true },
  imageInputParam: 'image',
  maxReferenceImages: 1,
  params: { ... },
  description: 'Acme\'s image generator with i2i support',
  whenToUse: 'Use for high-quality images with optional image-to-image',
},
```

### Step 3: Generate Route
```typescript
else if (model === 'super-gen') {
  input.image = byPurpose.reference[0]
}
```

### Step 4: Types.ts
```typescript
{
  id: 'super-gen',
  name: 'Super Gen',
  provider: 'Acme',
  description: 'High-quality image generation with i2i support',
  category: 'image',
  tags: ['high-quality', 'i2i'],
  replicateId: 'acme/super-gen'
},
```

### Step 5: System Prompt
```
**Image**: ..., super-gen, ...

- Super Gen: 8¢/image (supports image-to-image)
```

---

## Testing Checklist

After adding a model, verify:

- [ ] Model appears in the model selector UI
- [ ] Selecting the model works
- [ ] AI mentions the correct price in confirmation messages
- [ ] Reference images can be added (if supported)
- [ ] Generation completes successfully
- [ ] Cost is deducted correctly from user balance

---

## File Locations Summary

```
/lib/orchestrator/model-specs.ts    → Orchestrator capabilities
/lib/orchestrator/system-prompt.ts  → AI pricing knowledge
/lib/types.ts                       → UI model selector
/app/api/generate/route.ts          → Image routing
/app/api/estimate-cost/route.ts     → Cost calculation (reads from DB)
Supabase: studio_models table       → Pricing data
```

---

## Common Issues

### Model not showing in selector
→ Check `/lib/types.ts` - model must be in `mockModels` array

### Price not showing in chat
→ Check `/lib/orchestrator/system-prompt.ts` - model must be in pricing section

### Reference images not working
→ Check `/app/api/generate/route.ts` - add image routing for the model

### Wrong price being charged
→ Check Supabase `studio_models` table - verify `cost_per_run_cents`
