/**
 * Model Specifications for the Orchestrator
 *
 * Each model has a "spec sheet" that tells the orchestrator:
 * - What the model can do
 * - When to use it
 * - What parameters it accepts
 */

export interface ParamSpec {
  name: string
  type: 'string' | 'number' | 'enum' | 'boolean' | 'image'
  description: string
  options?: string[]
  default?: any
  range?: { min: number; max: number }
  required?: boolean
}

export interface ModelSpec {
  id: string
  name: string
  replicateId: string
  type: 'text-to-image' | 'image-to-image' | 'video' | 'upscale' | 'audio'
  capabilities: {
    textRendering?: boolean
    multipleReferences?: boolean
    lastFrame?: boolean
    controlNet?: boolean
    inpainting?: boolean
    outpainting?: boolean
    // Image input capabilities - tells AI which models accept reference images
    supportsReferenceImages?: boolean  // Can use reference images (ingredients/style guides)
    supportsStartingFrame?: boolean    // Can use starting frame for video/I2V
    supportsLastFrame?: boolean        // Can use end frame for video interpolation
    // Seedance-style multi-modal references: array of reference videos and/or
    // audio that drive the generation (motion transfer, style transfer,
    // audio-driven generation + lip-sync). Implies the model supports the
    // bracketed `[Image1]`/`[Video1]`/`[Audio1]` token syntax in the prompt.
    supportsReferenceVideos?: boolean
    supportsReferenceAudios?: boolean
    supportsAudioGeneration?: boolean
  }
  // The actual parameter name used by Replicate API for reference images
  imageInputParam?: string  // e.g., 'image_input', 'input_images', 'reference_images'
  maxReferenceImages?: number  // Maximum number of reference images supported
  // Seedance / multi-modal reference caps. Each entry has its own cap so the
  // canvas validator (and the brief generator) can enforce limits per channel.
  maxReferenceVideos?: number   // e.g., Seedance: 3 videos, total ≤15s
  maxReferenceAudios?: number   // e.g., Seedance: 3 audios, total ≤15s
  // Mutually-exclusive input modes. The canvas validator uses this so a node
  // with `image` populated can't ALSO accept `reference_images`, etc.
  // Each group lists params that cannot coexist with each other.
  inputModeGroups?: string[][]
  // Hard cap on prompt length. Seedance enforces 2500 chars; the
  // production-brief node truncates to this when the distilled prompt
  // overshoots.
  maxPromptChars?: number
  params: {
    required: ParamSpec[]
    optional: ParamSpec[]
  }
  // Pricing — both raw Replicate cost and our marked-up list price. Used by:
  //   - PreRunCheck / balance debit → list price (cost_per_*_cents)
  //   - actual_cost_cents tracking → raw cost (replicate_cost_per_*_cents)
  // For variable-cost models (Seedance: video-in vs non-video-in), the
  // matrix here lets the executor pick the right row at runtime.
  pricing?: {
    /** Raw Replicate cost per second (in cents) for non-video-input runs. */
    replicateCostPerSecondCents?: number
    /** Raw Replicate cost per second (in cents) when reference_videos used. */
    replicateCostPerSecondCentsVideoIn?: number
    /** Our list price per second (in cents) for non-video-input runs. */
    listCostPerSecondCents?: number
    /** Our list price per second (in cents) when reference_videos used. */
    listCostPerSecondCentsVideoIn?: number
    /** Per-resolution variant matrix. Key is the resolution enum value. */
    perResolution?: Record<string, {
      replicateCostPerSecondCents?: number
      replicateCostPerSecondCentsVideoIn?: number
      listCostPerSecondCents?: number
      listCostPerSecondCentsVideoIn?: number
    }>
    /** Default number of seconds to assume when duration is "intelligent"
        (-1 in Seedance). Conservative — used by cost preview. */
    intelligentDurationSeconds?: number
  }
  description: string
  whenToUse: string
  tips?: string[]
  /** When true, surface in the catalog as "coming soon" and never recommend
      directly — the Director will suggest the closest live alternative. */
  comingSoon?: boolean
}

export const MODEL_SPECS: ModelSpec[] = [
  // ========== TOP TIER MODELS ==========
  {
    id: 'seedream-4.5',
    name: 'Seedream 4.5',
    replicateId: 'bytedance/seedream-4.5',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
      multipleReferences: true,
      supportsReferenceImages: true,
    },
    imageInputParam: 'image_input',
    maxReferenceImages: 14,
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for image generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'size',
          type: 'enum',
          description: 'Image resolution: 2K (2048px) or 4K (4096px). 1K is not supported in Seedream 4.5.',
          options: ['2K', '4K'],
          default: '2K',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio. Use match_input_image to match the input image.',
          options: ['match_input_image', '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
          default: 'match_input_image',
        },
        {
          name: 'image_input',
          type: 'image',
          description: 'Input images for reference/image-to-image generation (1-14 images). Images should be marked as "Reference" purpose.',
        },
        {
          name: 'sequential_image_generation',
          type: 'enum',
          description: 'Group image generation mode. "auto" lets the model produce multiple related images (story scenes, character variations).',
          options: ['disabled', 'auto'],
          default: 'disabled',
        },
        {
          name: 'max_images',
          type: 'number',
          description: 'Max images when sequential_image_generation is "auto". Total (input + generated) must not exceed 15.',
          default: 1,
          range: { min: 1, max: 15 },
        },
        {
          name: 'disable_safety_checker',
          type: 'boolean',
          description: 'Disable the safety checker. When true, only illegal content (CSAM) is blocked.',
          default: false,
        },
      ],
    },
    description: 'ByteDance\'s top image model with strong spatial reasoning and up to 4K resolution.',
    whenToUse: 'Use for high-resolution professional work, complex multi-reference compositions, and the highest quality T2I/I2I output.',
    tips: [
      'Supports up to 4K resolution (no 1K option)',
      'Can use up to 14 reference images via image_input parameter',
      'Excellent for detailed, cinematic imagery',
      'Set sequential_image_generation="auto" with max_images>1 to generate related image sets',
      'When user attaches images as "Reference", they are passed via image_input',
    ],
  },
  {
    id: 'flux-2-pro',
    name: 'FLUX 2 Pro',
    replicateId: 'black-forest-labs/flux-2-pro',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
      multipleReferences: true,
      supportsReferenceImages: true,
    },
    imageInputParam: 'input_images',
    maxReferenceImages: 8,
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for image generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio',
          options: ['match_input_image', 'custom', '1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3'],
          default: '1:1',
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Resolution in megapixels (max image size 2048x2048; 2 MP or below recommended).',
          options: ['match_input_image', '0.5 MP', '1 MP', '2 MP', '4 MP'],
          default: '1 MP',
        },
        {
          name: 'input_images',
          type: 'image',
          description: 'Input images for reference/image-to-image (max 8 images, total ≤9 megapixels). Images should be marked as "Reference" purpose.',
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
        {
          name: 'output_quality',
          type: 'number',
          description: 'Output image quality (0-100). Ignored for PNG.',
          default: 80,
          range: { min: 0, max: 100 },
        },
        {
          name: 'safety_tolerance',
          type: 'number',
          description: 'Safety tolerance (1=strict, 5=permissive). Note: max is 5, not 6.',
          default: 2,
          range: { min: 1, max: 5 },
        },
      ],
    },
    description: 'BFL\'s flagship FLUX 2 model — strong text rendering, photorealism, and character consistency with up to 8 reference images.',
    whenToUse: 'Use for professional work, commercial projects, multi-reference compositions, and image editing tasks where FLUX 2 quality matters.',
    tips: [
      'Supports up to 4 MP resolution (image edge capped at 2048px)',
      'Up to 8 reference images via input_images parameter; combined input ≤9 MP',
      'Best overall FLUX model for quality + editing',
      'Use match_input_image resolution to preserve reference-image proportions',
      'When user attaches images as "Reference", they are passed via input_images',
    ],
  },
  {
    id: 'nano-banana',
    name: 'Nano Banana',
    replicateId: 'google/nano-banana',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
      multipleReferences: true,
      supportsReferenceImages: true,
    },
    imageInputParam: 'image_input',
    maxReferenceImages: 10, // API says "supports multiple"; conservative cap retained
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'image_input',
          type: 'image',
          description: 'Input images to transform or use as reference (supports multiple)',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Aspect ratio of the generated image. match_input_image follows the first reference image.',
          options: ['match_input_image', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
          default: 'match_input_image',
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Format of the output image',
          options: ['jpg', 'png'],
          default: 'jpg',
        },
      ],
    },
    description: 'Google\'s Gemini 2.5-based image editor — fast and good at style transfer / reference-driven edits.',
    whenToUse: 'Use for fast, lower-cost edits and reference-based generation. For 4K, more references, or higher quality, prefer Nano Banana Pro.',
    tips: [
      'Great for style transfer and quick edits',
      'Supports multiple reference images',
      'Fast and efficient — newer Nano Banana Pro is the higher-quality successor',
    ],
  },
  // ========== FLUX FAMILY ==========
  {
    id: 'flux-schnell',
    name: 'FLUX Schnell',
    replicateId: 'black-forest-labs/flux-schnell',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'The text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio',
          options: ['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21'],
          default: '1:1',
        },
        {
          name: 'num_outputs',
          type: 'number',
          description: 'Number of images to generate',
          default: 1,
          range: { min: 1, max: 4 },
        },
        {
          name: 'megapixels',
          type: 'enum',
          description: 'Approximate output megapixels',
          options: ['1', '0.25'],
          default: '1',
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          description: 'Number of denoising steps. 4 is recommended; lower = faster but lower quality.',
          default: 4,
          range: { min: 1, max: 4 },
        },
        {
          name: 'go_fast',
          type: 'boolean',
          description: 'Use the fp8-quantized speed-optimized variant (non-deterministic even with fixed seed).',
          default: true,
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
        {
          name: 'output_quality',
          type: 'number',
          description: 'Output image quality (0-100). Ignored for PNG.',
          default: 80,
          range: { min: 0, max: 100 },
        },
      ],
    },
    description: 'Fastest FLUX variant — sub-second generation tuned for local dev and rapid iteration.',
    whenToUse: 'Use for fast previews, mood boards, and rapid iteration when speed matters more than peak quality. Step out to flux-dev or flux-2-pro for finals.',
    tips: [
      'Great for rapid prototyping at ~$0.003/image',
      'Handles text in images reasonably well',
      'Cap of 4 inference steps — quality plateaus quickly',
      'go_fast=true is the default and the right call for previews',
    ],
  },
  {
    id: 'flux-dev',
    name: 'FLUX Dev',
    replicateId: 'black-forest-labs/flux-dev',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'The text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio',
          options: ['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21'],
          default: '1:1',
        },
        {
          name: 'image',
          type: 'image',
          description: 'Input image for image-to-image. Output aspect ratio matches this image.',
        },
        {
          name: 'prompt_strength',
          type: 'number',
          description: 'Strength of prompt vs input image (img2img). 1.0 = full destruction of input.',
          default: 0.8,
          range: { min: 0, max: 1 },
        },
        {
          name: 'guidance',
          type: 'number',
          description: 'How closely to follow the prompt',
          default: 3,
          range: { min: 0, max: 10 },
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          description: 'Quality vs speed tradeoff. 28-50 recommended.',
          default: 28,
          range: { min: 1, max: 50 },
        },
        {
          name: 'megapixels',
          type: 'enum',
          description: 'Approximate output megapixels',
          options: ['1', '0.25'],
          default: '1',
        },
        {
          name: 'num_outputs',
          type: 'number',
          description: 'Number of images to generate per call',
          default: 1,
          range: { min: 1, max: 4 },
        },
        {
          name: 'go_fast',
          type: 'boolean',
          description: 'Use fp8-quantized speed-optimized variant (non-deterministic even with fixed seed).',
          default: true,
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
        {
          name: 'output_quality',
          type: 'number',
          description: 'Output image quality (0-100). Ignored for PNG.',
          default: 80,
          range: { min: 0, max: 100 },
        },
      ],
    },
    description: 'Mid-tier FLUX with more control than Schnell — supports img2img and tunable guidance/steps.',
    whenToUse: 'Use for finals where you want FLUX 1.x quality without paying flux-pro / flux-2 rates. For top quality and reference editing prefer flux-2-pro.',
    tips: [
      'More detailed and accurate than Schnell',
      'Supports img2img via the image parameter (output matches input aspect ratio)',
      'Slower but higher quality than Schnell; consider flux-2-pro for SOTA',
    ],
  },
  {
    id: 'flux-pro',
    name: 'FLUX Pro 1.1',
    replicateId: 'black-forest-labs/flux-1.1-pro',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'The text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio',
          options: ['custom', '1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3'],
          default: '1:1',
        },
        {
          name: 'width',
          type: 'number',
          description: 'Width when aspect_ratio=custom. Multiple of 32.',
          range: { min: 256, max: 1440 },
        },
        {
          name: 'height',
          type: 'number',
          description: 'Height when aspect_ratio=custom. Multiple of 32.',
          range: { min: 256, max: 1440 },
        },
        {
          name: 'image_prompt',
          type: 'image',
          description: 'Reference image for Flux Redux — guides composition alongside the text prompt.',
        },
        {
          name: 'safety_tolerance',
          type: 'number',
          description: 'Content safety threshold (1=strict, 6=permissive)',
          default: 2,
          range: { min: 1, max: 6 },
        },
        {
          name: 'prompt_upsampling',
          type: 'boolean',
          description: 'Auto-rewrite the prompt for more creative generation',
          default: false,
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
        {
          name: 'output_quality',
          type: 'number',
          description: 'Output quality (0-100). Ignored for PNG.',
          default: 80,
          range: { min: 0, max: 100 },
        },
      ],
    },
    description: 'FLUX 1.1 Pro — high-quality T2I with Flux Redux composition guidance. Superseded for editing by flux-2-pro.',
    whenToUse: 'Use for FLUX 1.x-style finals or when you specifically need Flux Redux composition guidance. For multi-reference editing, use flux-2-pro instead.',
    tips: [
      'Use image_prompt for Flux Redux composition guidance',
      'Excellent prompt adherence',
      'flux-2-pro now generally outperforms 1.1 Pro for editing/multi-reference',
    ],
  },
  {
    id: 'sdxl',
    name: 'Stable Diffusion XL',
    replicateId: 'stability-ai/sdxl',
    type: 'text-to-image',
    capabilities: {
      textRendering: false,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'The text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'negative_prompt',
          type: 'string',
          description: 'What to avoid in the image',
        },
        {
          name: 'image',
          type: 'image',
          description: 'Input image for img2img or inpainting modes',
        },
        {
          name: 'mask',
          type: 'image',
          description: 'Inpaint mask. Black areas preserved, white areas inpainted.',
        },
        {
          name: 'width',
          type: 'number',
          description: 'Image width',
          default: 1024,
          range: { min: 512, max: 1536 },
        },
        {
          name: 'height',
          type: 'number',
          description: 'Image height',
          default: 1024,
          range: { min: 512, max: 1536 },
        },
        {
          name: 'num_outputs',
          type: 'number',
          description: 'Number of images to generate per call',
          default: 1,
          range: { min: 1, max: 4 },
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          description: 'Number of denoising steps',
          default: 50,
          range: { min: 1, max: 500 },
        },
        {
          name: 'guidance_scale',
          type: 'number',
          description: 'Classifier-free guidance scale',
          default: 7.5,
          range: { min: 1, max: 50 },
        },
        {
          name: 'prompt_strength',
          type: 'number',
          description: 'Prompt strength for img2img/inpaint. 1.0 = full destruction of input.',
          default: 0.8,
          range: { min: 0, max: 1 },
        },
        {
          name: 'scheduler',
          type: 'enum',
          description: 'Sampling scheduler',
          options: ['DDIM', 'DPMSolverMultistep', 'HeunDiscrete', 'KarrasDPM', 'K_EULER_ANCESTRAL', 'K_EULER', 'PNDM'],
          default: 'K_EULER',
        },
        {
          name: 'refine',
          type: 'enum',
          description: 'Refinement style for higher detail at the cost of speed',
          options: ['no_refiner', 'expert_ensemble_refiner', 'base_image_refiner'],
          default: 'no_refiner',
        },
        {
          name: 'apply_watermark',
          type: 'boolean',
          description: 'Apply an invisible watermark to detect generated outputs.',
          default: true,
        },
      ],
    },
    description: 'Stability AI\'s SDXL — legacy but still useful for negative prompts, img2img, inpainting, and LoRA workflows.',
    whenToUse: 'Use for fine parameter control, inpainting, negative prompts, or LoRA-driven styles. For pure quality, prefer FLUX 2 / Seedream 4.5 / Nano Banana Pro.',
    tips: [
      'Negative prompts help avoid unwanted elements',
      'Inpainting via image + mask',
      'Older model — newer FLUX/Seedream/Nano Banana Pro typically beat it on quality',
    ],
  },
  {
    id: 'recraft-v3',
    name: 'Recraft V3',
    replicateId: 'recraft-ai/recraft-v3',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'The text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'style',
          type: 'enum',
          description: 'Visual style of the output. Substyles like digital_illustration/pixel_art enable specific looks.',
          options: [
            'any',
            'realistic_image',
            'digital_illustration',
            'digital_illustration/pixel_art',
            'digital_illustration/hand_drawn',
            'digital_illustration/grain',
            'digital_illustration/infantile_sketch',
            'digital_illustration/2d_art_poster',
            'digital_illustration/handmade_3d',
            'digital_illustration/hand_drawn_outline',
            'digital_illustration/engraving_color',
            'digital_illustration/2d_art_poster_2',
            'realistic_image/b_and_w',
            'realistic_image/hard_flash',
            'realistic_image/hdr',
            'realistic_image/natural_light',
            'realistic_image/studio_portrait',
            'realistic_image/enterprise',
            'realistic_image/motion_blur',
          ],
          default: 'any',
        },
        {
          name: 'size',
          type: 'enum',
          description: 'Output image size. Ignored if aspect_ratio is set.',
          options: ['1024x1024', '1365x1024', '1024x1365', '1536x1024', '1024x1536', '1820x1024', '1024x1820', '1024x2048', '2048x1024', '1434x1024', '1024x1434', '1024x1280', '1280x1024', '1024x1707', '1707x1024'],
          default: '1024x1024',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Aspect ratio of the generated image. Overrides size when set.',
          options: ['Not set', '1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '1:2', '2:1', '7:5', '5:7', '4:5', '5:4', '3:5', '5:3'],
          default: 'Not set',
        },
      ],
    },
    description: 'Recraft V3 (red_panda) — SOTA for design work, illustrations, icons, and crisp text.',
    whenToUse: 'Use for vector-style graphics, icons, posters, design assets, and any output where the substyle picker matters.',
    tips: [
      'Best for clean, design-focused outputs',
      'Great for icons and illustrations',
      'Excellent text rendering',
      'Substyles like realistic_image/studio_portrait give very specific looks',
    ],
  },
  {
    id: 'ideogram',
    name: 'Ideogram V2',
    replicateId: 'ideogram-ai/ideogram-v2',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'The text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio. Ignored if resolution or inpainting image is given.',
          options: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '16:10', '10:16', '3:1', '1:3'],
          default: '1:1',
        },
        {
          name: 'style_type',
          type: 'enum',
          description: 'Visual style',
          options: ['None', 'Auto', 'General', 'Realistic', 'Design', 'Render 3D', 'Anime'],
          default: 'Auto',
        },
        {
          name: 'magic_prompt_option',
          type: 'enum',
          description: 'Magic Prompt rewrites your prompt to maximize variety and quality. Also useful for non-English prompts.',
          options: ['Auto', 'On', 'Off'],
          default: 'Auto',
        },
        {
          name: 'negative_prompt',
          type: 'string',
          description: 'Things you do not want to see in the generated image.',
        },
        {
          name: 'image',
          type: 'image',
          description: 'Image for inpainting (requires mask).',
        },
        {
          name: 'mask',
          type: 'image',
          description: 'Inpaint mask. Black pixels are inpainted, white preserved.',
        },
      ],
    },
    description: 'Ideogram V2 — strong text rendering and prompt comprehension. Newer Ideogram V3 (quality / turbo) typically outperforms it.',
    whenToUse: 'Use when you need V2-specific behavior or pricing. For most text/typography work, prefer Ideogram V3 Quality (or V3 Turbo for speed).',
    tips: [
      'Best-in-class text rendering for V2-era models',
      'Use magic_prompt_option=Auto for prompt enhancement',
      'Supports inpainting via image + mask',
      'Consider migrating to ideogram-ai/ideogram-v3-quality or ideogram-v3-turbo',
    ],
  },
  // ========== NEW IMAGE MODELS ==========
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    replicateId: 'prunaai/z-image-turbo',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for image generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'width',
          type: 'number',
          description: 'Image width',
          default: 1024,
          range: { min: 64, max: 2048 },
        },
        {
          name: 'height',
          type: 'number',
          description: 'Image height',
          default: 1024,
          range: { min: 64, max: 2048 },
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          description: 'Number of inference steps. 8 is the recommended turbo setting.',
          default: 8,
          range: { min: 1, max: 50 },
        },
        {
          name: 'guidance_scale',
          type: 'number',
          description: 'Guidance scale. Should be 0 for Turbo models.',
          default: 0,
          range: { min: 0, max: 20 },
        },
        {
          name: 'go_fast',
          type: 'boolean',
          description: 'Apply additional optimizations for faster generation.',
          default: false,
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['png', 'jpg', 'webp'],
          default: 'jpg',
        },
        {
          name: 'output_quality',
          type: 'number',
          description: 'Output image quality (0-100). Ignored for PNG.',
          default: 80,
          range: { min: 0, max: 100 },
        },
      ],
    },
    description: 'Tongyi-MAI\'s 6B Z-Image Turbo — sub-second generation for rapid iteration.',
    whenToUse: 'Use when you need the fastest possible image at low cost. For final quality, escalate to FLUX 2 / Seedream / Nano Banana Pro.',
    tips: [
      'Extremely fast generation (~1-2s)',
      'Good quality for the speed; 8 steps is the sweet spot',
      'Keep guidance_scale at 0 — Turbo models are tuned for it',
      'Supports up to 2048px width/height',
    ],
  },
  {
    id: 'qwen-image-2512',
    name: 'Qwen Image 2512',
    replicateId: 'qwen/qwen-image-2512',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
      supportsReferenceImages: true,
    },
    imageInputParam: 'image',
    maxReferenceImages: 1,
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for image generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'negative_prompt',
          type: 'string',
          description: 'Negative prompt for image generation',
        },
        {
          name: 'image',
          type: 'image',
          description: 'Input image for image2image generation. Output matches this aspect ratio.',
        },
        {
          name: 'strength',
          type: 'number',
          description: 'Strength for image2image (0-1). 1.0 = full destruction of input.',
          default: 0.8,
          range: { min: 0, max: 1 },
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Aspect ratio for generated image',
          options: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', 'custom'],
          default: '16:9',
        },
        {
          name: 'width',
          type: 'number',
          description: 'Width (only for custom aspect ratio, multiple of 16)',
          range: { min: 256, max: 2048 },
        },
        {
          name: 'height',
          type: 'number',
          description: 'Height (only for custom aspect ratio, multiple of 16)',
          range: { min: 256, max: 2048 },
        },
        {
          name: 'guidance',
          type: 'number',
          description: 'Guidance scale for prompt adherence',
          default: 4,
          range: { min: 0, max: 10 },
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          description: 'Number of denoising steps',
          default: 40,
          range: { min: 20, max: 50 },
        },
        {
          name: 'go_fast',
          type: 'boolean',
          description: 'Use optimizations for faster generation',
          default: true,
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
        {
          name: 'output_quality',
          type: 'number',
          description: 'Output quality (0-100). Ignored for PNG.',
          default: 95,
          range: { min: 0, max: 100 },
        },
        {
          name: 'disable_safety_checker',
          type: 'boolean',
          description: 'Disable the safety checker for generated images.',
          default: false,
        },
      ],
    },
    description: 'Qwen Image 2512 — improved Qwen model with realistic humans, fine textures, and stronger text rendering up to 2048px.',
    whenToUse: 'Use for high-quality images with strong text rendering and optional img2img. Strong all-rounder; lower-cost than Seedream 4.5.',
    tips: [
      'Supports image-to-image via the image parameter (output matches input aspect ratio)',
      'Use strength to control how much the input image influences output',
      'Supports up to 2048px resolution',
      'Good balance of quality and speed with go_fast enabled (default true)',
    ],
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    replicateId: 'google/nano-banana-pro',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
      multipleReferences: true,
      supportsReferenceImages: true,
    },
    imageInputParam: 'image_input',
    maxReferenceImages: 14,
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text description of the image to generate',
          required: true,
        },
      ],
      optional: [
        {
          name: 'image_input',
          type: 'image',
          description: 'Input images for reference (up to 14)',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Aspect ratio of the generated image. match_input_image follows the first reference image.',
          options: ['match_input_image', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
          default: 'match_input_image',
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Resolution of the generated image',
          options: ['1K', '2K', '4K'],
          default: '2K',
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Format of the output image',
          options: ['jpg', 'png'],
          default: 'jpg',
        },
        {
          name: 'safety_filter_level',
          type: 'enum',
          description: 'Safety filter strictness. block_low_and_above is strictest; block_only_high is most permissive (some prompts still blocked).',
          options: ['block_low_and_above', 'block_medium_and_above', 'block_only_high'],
          default: 'block_only_high',
        },
        {
          name: 'allow_fallback_model',
          type: 'boolean',
          description: 'If Nano Banana Pro is at capacity, fall back to another model (currently bytedance/seedream-5).',
          default: false,
        },
      ],
    },
    description: 'Google\'s flagship Gemini-3-based image model — 4K support, up to 14 reference images, top-tier prompt comprehension.',
    whenToUse: 'Use for the highest-quality Google output, complex multi-reference scenes, and 4K renders. Strong default for hero shots and cover art.',
    tips: [
      'Supports up to 4K resolution (2K is the default)',
      'Up to 14 reference images via image_input',
      'Best for complex multi-reference tasks; tight prompt adherence',
      'allow_fallback_model=true reduces capacity errors but uses Seedream 5 as backup',
    ],
  },
  {
    id: 'flux-2-flex',
    name: 'FLUX 2 Flex',
    replicateId: 'black-forest-labs/flux-2-flex',
    type: 'text-to-image',
    capabilities: {
      textRendering: true,
      multipleReferences: true,
      supportsReferenceImages: true,
    },
    imageInputParam: 'input_images',
    maxReferenceImages: 10,
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for image generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'steps',
          type: 'number',
          description: 'Number of inference steps',
          default: 30,
          range: { min: 1, max: 50 },
        },
        {
          name: 'guidance',
          type: 'number',
          description: 'Guidance scale controlling prompt adherence',
          default: 4.5,
          range: { min: 1.5, max: 10 },
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Resolution in megapixels (max image size 2048x2048; 2 MP or below recommended).',
          options: ['match_input_image', '0.5 MP', '1 MP', '2 MP', '4 MP'],
          default: '1 MP',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio. Use match_input_image to match the first input image.',
          options: ['match_input_image', 'custom', '1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3'],
          default: '1:1',
        },
        {
          name: 'width',
          type: 'number',
          description: 'Width when aspect_ratio=custom. Multiple of 16.',
          range: { min: 256, max: 2048 },
        },
        {
          name: 'height',
          type: 'number',
          description: 'Height when aspect_ratio=custom. Multiple of 16.',
          range: { min: 256, max: 2048 },
        },
        {
          name: 'input_images',
          type: 'image',
          description: 'Input images for image-to-image (max 10 images)',
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
        {
          name: 'output_quality',
          type: 'number',
          description: 'Output quality (0-100). Ignored for PNG.',
          default: 80,
          range: { min: 0, max: 100 },
        },
        {
          name: 'safety_tolerance',
          type: 'number',
          description: 'Safety tolerance (1=strict, 5=permissive). Note: max is 5, not 6.',
          default: 2,
          range: { min: 1, max: 5 },
        },
        {
          name: 'prompt_upsampling',
          type: 'boolean',
          description: 'Auto-enhance prompts for creative generation',
          default: true,
        },
      ],
    },
    description: 'Max-quality FLUX 2 Flex — up to 10 reference images, guidance/steps control, 4 MP output.',
    whenToUse: 'Use for hero shots and complex multi-reference work where you want fine guidance/steps control beyond what flux-2-pro exposes.',
    tips: [
      'Up to 10 reference images',
      'Fine guidance + steps control vs the simpler flux-2-pro interface',
      'Premium option for important work — most expensive FLUX variant',
      'match_input_image for both aspect_ratio and resolution preserves reference proportions',
    ],
  },
  // ========== VIDEO MODELS ==========
  {
    id: 'veo-3.1',
    name: 'Veo 3.1',
    replicateId: 'google/veo-3.1',
    type: 'video',
    capabilities: {
      multipleReferences: true,
      lastFrame: true,
      supportsReferenceImages: true,
      supportsStartingFrame: true,
      supportsLastFrame: true,
    },
    imageInputParam: 'reference_images',
    maxReferenceImages: 3,
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for video generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'image',
          type: 'image',
          description: 'Starting frame image for I2V mode. Best at 1280x720 (16:9) or 720x1280 (9:16). User should mark as "Start Frame".',
        },
        {
          name: 'last_frame',
          type: 'image',
          description: 'Ending frame for interpolation. Creates transition from start to end. User should mark as "End Frame".',
        },
        {
          name: 'reference_images',
          type: 'image',
          description: '1-3 reference images for subject consistency (R2V mode). Only works with 16:9 aspect ratio and 8s duration. User should mark as "Reference".',
        },
        {
          name: 'duration',
          type: 'enum',
          description: 'Video length in seconds. R2V (reference_images) requires 8s.',
          options: ['4', '6', '8'],
          default: '8',
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Output resolution',
          options: ['720p', '1080p'],
          default: '1080p',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Video dimensions. R2V (reference_images) only works with 16:9.',
          options: ['16:9', '9:16'],
          default: '16:9',
        },
        {
          name: 'generate_audio',
          type: 'boolean',
          description: 'Generate context-aware audio with the video. Audio adds to cost.',
          default: true,
        },
        {
          name: 'negative_prompt',
          type: 'string',
          description: 'Description of what to exclude from the generated video',
        },
      ],
    },
    description: 'Google Veo 3.1 — flagship video model with context-aware audio, 1080p output, reference-to-video, and last-frame interpolation.',
    whenToUse: 'Use for the highest-quality videos with native audio and subject consistency. For lower-cost preview drafts, consider veo-3.1-fast or wan-2.5-i2v.',
    tips: [
      'Generates context-aware audio automatically (toggle off to halve cost)',
      'Supports start/end frame interpolation via image and last_frame',
      'Up to 3 reference images for R2V — only works with 16:9 + 8s duration',
      'When user marks image as "Start Frame", it goes to image parameter',
      'When user marks image as "End Frame", it goes to last_frame parameter',
      'When user marks images as "Reference", they go to reference_images parameter',
      'For cheaper drafts, swap to google/veo-3.1-fast (same schema, lower per-second cost)',
    ],
  },
  {
    id: 'wan-2.5-t2v',
    name: 'Wan 2.5 T2V',
    replicateId: 'wan-video/wan-2.5-t2v',
    type: 'video',
    capabilities: {},
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for video generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'negative_prompt',
          type: 'string',
          description: 'What to avoid in the video',
        },
        {
          name: 'size',
          type: 'enum',
          description: 'Video resolution and aspect ratio (width*height)',
          options: ['832*480', '480*832', '1280*720', '720*1280', '1920*1080', '1080*1920'],
          default: '1280*720',
        },
        {
          name: 'duration',
          type: 'enum',
          description: 'Duration in seconds',
          options: ['5', '10'],
          default: '5',
        },
        {
          name: 'audio',
          type: 'string',
          description: 'Audio file (wav/mp3, 3-30s, ≤15MB) for voice/music synchronization.',
        },
        {
          name: 'enable_prompt_expansion',
          type: 'boolean',
          description: 'Enable prompt optimizer',
          default: true,
        },
      ],
    },
    description: 'Alibaba Wan 2.5 text-to-video with optional audio sync. Newer wan-video/wan-2.6-t2v is now available.',
    whenToUse: 'Use for budget text-to-video without a starting frame. For latest Alibaba quality, consider wan-video/wan-2.6-t2v.',
    tips: [
      'Uses size (e.g. "1280*720") not a resolution enum — aspect ratio is baked into size',
      'Supports up to 1080p (1920*1080) output',
      'Can sync to an audio track via the audio parameter',
      'Use Wan 2.5 I2V instead if you have a starting image',
      'Wan 2.6 successor is live — consider migrating',
    ],
  },
  {
    id: 'wan-2.5-i2v',
    name: 'Wan 2.5 I2V',
    replicateId: 'wan-video/wan-2.5-i2v',
    type: 'video',
    capabilities: {
      supportsStartingFrame: true,
    },
    imageInputParam: 'image',
    params: {
      required: [
        {
          name: 'image',
          type: 'image',
          description: 'Input image for video generation. This is REQUIRED. User should mark as "Start Frame".',
          required: true,
        },
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for video generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'negative_prompt',
          type: 'string',
          description: 'What to avoid in the video',
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Video resolution',
          options: ['480p', '720p', '1080p'],
          default: '720p',
        },
        {
          name: 'duration',
          type: 'enum',
          description: 'Duration in seconds',
          options: ['5', '10'],
          default: '5',
        },
        {
          name: 'enable_prompt_expansion',
          type: 'boolean',
          description: 'Enable prompt optimizer',
          default: true,
        },
        {
          name: 'audio',
          type: 'string',
          description: 'Audio file (wav/mp3, 3-30s, ≤15MB) for voice/music synchronization',
        },
      ],
    },
    description: 'Alibaba Wan 2.5 image-to-video with optional audio sync. REQUIRES a starting image. Newer wan-video/wan-2.6-i2v is now available.',
    whenToUse: 'Use for budget image-to-video when you have a starting frame. For latest Alibaba quality, consider wan-video/wan-2.6-i2v.',
    tips: [
      'Requires an input image — user should mark as "Start Frame"',
      'Supports up to 1080p output',
      'Can sync with audio file (wav/mp3, 3-30s, ≤15MB) for music/voice',
      'Good budget option for I2V compared to Veo 3.1',
      'Wan 2.6 successor is live — consider migrating',
    ],
  },
  {
    id: 'kling-v2.5-turbo-pro',
    name: 'Kling V2.5 Turbo Pro',
    replicateId: 'kwaivgi/kling-v2.5-turbo-pro',
    type: 'video',
    capabilities: {
      supportsStartingFrame: true,
      supportsLastFrame: true,
      lastFrame: true,
    },
    imageInputParam: 'start_image',
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for video generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'start_image',
          type: 'image',
          description: 'First frame of the video for I2V. User should mark as "Start Frame". When provided, aspect_ratio is ignored.',
        },
        {
          name: 'end_image',
          type: 'image',
          description: 'Last frame of the video. Combine with start_image for first→last interpolation. User should mark as "End Frame".',
        },
        {
          name: 'duration',
          type: 'enum',
          description: 'Video duration in seconds',
          options: ['5', '10'],
          default: '5',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Video aspect ratio (ignored if start_image provided)',
          options: ['16:9', '9:16', '1:1'],
          default: '16:9',
        },
        {
          name: 'negative_prompt',
          type: 'string',
          description: 'Things you do not want to see in the video',
        },
      ],
    },
    description: 'Kuaishou Kling 2.5 Turbo Pro — strong motion and prompt adherence with start+end frame interpolation. Newer kling-v2.6 is now available.',
    whenToUse: 'Use for cinematic video with realistic motion (T2V or I2V) and first→last frame interpolation. For latest Kling quality, consider kwaivgi/kling-v2.6.',
    tips: [
      'For I2V, attach image and mark as "Start Frame" — goes to start_image',
      'Add an "End Frame" to interpolate between two frames via end_image',
      'Aspect ratio is auto-matched from start_image when provided',
      'Good quality-to-cost ratio',
      'guidance_scale is kept for backwards compatibility but unused',
    ],
  },
  {
    id: 'hailuo-2.3',
    name: 'Hailuo 2.3',
    replicateId: 'minimax/hailuo-2.3',
    type: 'video',
    capabilities: {
      supportsStartingFrame: true,
    },
    imageInputParam: 'first_frame_image',
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for video generation',
          required: true,
        },
      ],
      optional: [
        {
          name: 'first_frame_image',
          type: 'image',
          description: 'First frame image for video start (I2V). User should mark as "Start Frame". Output matches image aspect ratio.',
        },
        {
          name: 'duration',
          type: 'enum',
          description: 'Video duration (6s for 1080p, 10s for 768p only)',
          options: ['6', '10'],
          default: '6',
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Output resolution',
          options: ['768p', '1080p'],
          default: '768p',
        },
        {
          name: 'prompt_optimizer',
          type: 'boolean',
          description: 'Use prompt optimizer',
          default: true,
        },
      ],
    },
    description: 'MiniMax Hailuo 2.3 — cinematic video model tuned for realistic human motion, expressive characters, and VFX across T2V and I2V.',
    whenToUse: 'Use for realistic human motion, expressive characters, and cinematic VFX. Strong I2V option alongside Kling 2.5 and Veo 3.1.',
    tips: [
      'Best for realistic human motion',
      'Great for cinematic VFX',
      '1080p only at 6s; 10s requires 768p',
      'For I2V, attach image and mark as "Start Frame" — goes to first_frame_image',
      'Output aspect ratio matches first_frame_image when provided',
    ],
  },
  // ========== SEEDANCE 2.0 (ByteDance) — first-class multi-modal video ==========
  // Replicate schema reference (Henry, May 2026):
  //   - prompt is required, hard-capped at 2500 chars (Henry confirmed)
  //   - prompt may embed [Image1]/[Image2]…/[Audio1]/[Video1] tokens that
  //     resolve to entries in reference_images / reference_audios /
  //     reference_videos arrays
  //   - dialogue uses double-quotes inside the prompt; supports SFX + BGM
  //   - generate_audio defaults to TRUE (we expose toggle either way)
  // Mutually-exclusive input modes (see inputModeGroups):
  //   A. T2V                 — prompt only
  //   B. I2V / first→last    — image (+ optional last_frame_image)
  //   C. Multi-ref           — reference_images and/or reference_videos
  //                            and/or reference_audios. reference_audios
  //                            REQUIRES at least one reference_image OR
  //                            reference_video.
  //   B and C cannot coexist with each other.
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    replicateId: 'bytedance/seedance-2.0',
    type: 'video',
    capabilities: {
      multipleReferences: true,
      lastFrame: true,
      supportsReferenceImages: true,
      supportsStartingFrame: true,
      supportsLastFrame: true,
      supportsReferenceVideos: true,
      supportsReferenceAudios: true,
      supportsAudioGeneration: true,
    },
    imageInputParam: 'reference_images',
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    maxPromptChars: 2500,
    // Each group lists params that cannot coexist. The canvas validator + the
    // settings UI use this to enforce Seedance's three-mode mutex.
    inputModeGroups: [
      ['image', 'reference_images'],
      ['image', 'reference_videos'],
      ['image', 'reference_audios'],
      ['last_frame_image', 'reference_images'],
      ['last_frame_image', 'reference_videos'],
      ['last_frame_image', 'reference_audios'],
    ],
    pricing: {
      // Replicate's raw cost matrix (per second of OUTPUT video).
      // Source: bytedance/seedance-2.0 pricing tab on Replicate, May 2026.
      // Variant detection: if reference_videos.length > 0 → video-in row.
      // intelligentDurationSeconds=8 → conservative budget for duration=-1.
      intelligentDurationSeconds: 8,
      perResolution: {
        '480p': {
          replicateCostPerSecondCents: 8,
          replicateCostPerSecondCentsVideoIn: 10,
          listCostPerSecondCents: 10,
          listCostPerSecondCentsVideoIn: 13,
        },
        '720p': {
          replicateCostPerSecondCents: 18,
          replicateCostPerSecondCentsVideoIn: 22,
          listCostPerSecondCents: 24,
          listCostPerSecondCentsVideoIn: 29,
        },
        '1080p': {
          replicateCostPerSecondCents: 45,
          replicateCostPerSecondCentsVideoIn: 55,
          listCostPerSecondCents: 60,
          listCostPerSecondCentsVideoIn: 75,
        },
      },
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for video generation. Max 2500 chars. May embed [Image1] / [Audio1] / [Video1] tokens that resolve to entries in reference_images / reference_audios / reference_videos. Dialogue uses double-quotes; supports SFX + BGM cues when generate_audio is on.',
          required: true,
        },
      ],
      optional: [
        {
          name: 'seed',
          type: 'number',
          description: 'Reproducibility seed. Nullable.',
        },
        {
          name: 'image',
          type: 'image',
          description: 'First frame for image-to-video. Mutually exclusive with reference_images / reference_videos / reference_audios.',
        },
        {
          name: 'last_frame_image',
          type: 'image',
          description: 'End frame for first→last interpolation. Requires `image` to also be set. Mutually exclusive with reference_*.',
        },
        {
          name: 'duration',
          type: 'number',
          description: 'Length in seconds. Range -1 to 15. -1 = intelligent duration (model picks).',
          default: 5,
          range: { min: -1, max: 15 },
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Output resolution. Drives cost per second (480p cheapest, 1080p priciest).',
          options: ['480p', '720p', '1080p'],
          default: '720p',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Frame aspect ratio. "adaptive" lets the model pick.',
          options: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21', 'adaptive'],
          default: '16:9',
        },
        {
          name: 'generate_audio',
          type: 'boolean',
          description: 'Generate synced audio (dialogue / SFX / BGM). Dialogue uses double-quoted speech in the prompt.',
          default: true,
        },
        {
          name: 'reference_images',
          type: 'image',
          description: '1-9 reference images (character/style/composition). Mutually exclusive with image / last_frame_image. Resolved as [Image1]…[ImageN] in the prompt.',
        },
        {
          name: 'reference_videos',
          type: 'string',
          description: '1-3 reference videos (motion transfer / style / editing). Total length ≤15s. Mutually exclusive with image / last_frame_image. Resolved as [Video1]…[Video3] in the prompt. When set, this is a "video-in" run and bills at the higher per-second rate.',
        },
        {
          name: 'reference_audios',
          type: 'string',
          description: '1-3 reference audios for audio-driven generation + lip-sync. Total length ≤15s. Requires at least one reference_image or reference_video. Resolved as [Audio1]…[Audio3] in the prompt.',
        },
      ],
    },
    description: 'ByteDance\'s flagship multi-modal video model. Three modes: T2V, I2V (with optional end frame), or multi-ref (up to 9 images + 3 videos + 3 audios). Generates synced audio including dialogue, SFX, and BGM. Prompt supports [Image1] / [Video1] / [Audio1] tokens.',
    whenToUse: 'Use for production-grade short videos that need reference fidelity, motion transfer, lip-synced dialogue, or specific BGM/SFX cues. Pair with a production-brief node to distill storyboards + concept into a single 2500-char Seedance prompt.',
    tips: [
      'Three input modes are mutually exclusive — pick one: T2V (prompt only), I2V (image + optional last_frame_image), or multi-ref (reference_images / videos / audios).',
      'reference_videos triggers the higher "video-in" pricing tier (e.g. 75¢/s at 1080p vs 60¢/s without).',
      'Duration -1 = intelligent duration; we budget 8s for cost preview.',
      'Prompt has a hard 2500-char cap. The production-brief node truncates over-long distilled prompts with an ellipsis + warning.',
      'Dialogue → put it in double quotes inside the prompt. The model lip-syncs against the on-screen subject.',
      'reference_audios requires at least one reference_image or reference_video.',
    ],
  },
  // ========== ROADMAP / COMING SOON ==========
  // Listed so the Director can ACKNOWLEDGE these by name and recommend the
  // closest current alternative — but never wire them into a canvas action.
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    replicateId: '', // not yet on Replicate
    type: 'text-to-image',
    comingSoon: true,
    capabilities: {
      textRendering: true,
      multipleReferences: true,
      supportsReferenceImages: true,
    },
    params: {
      required: [
        {
          name: 'prompt',
          type: 'string',
          description: 'Text prompt for image generation.',
          required: true,
        },
      ],
      optional: [],
    },
    description: 'OpenAI\'s next-gen image model. Image quality + text rendering on par with the best, with much stronger instruction-following. Roadmap — not live yet.',
    whenToUse: 'When live: editorial / commercial deliverables that need exact instruction-following. Until then: substitute Flux 2 Pro (photoreal) or Nano Banana Pro (multi-ref).',
    tips: [
      'Coming soon — do NOT wire into a canvas. The Director will suggest Flux 2 Pro or Nano Banana Pro instead.',
    ],
  },
]

/**
 * Get a model spec by ID
 */
export function getModelSpec(id: string): ModelSpec | undefined {
  return MODEL_SPECS.find(m => m.id === id)
}

/**
 * Get all model specs formatted for the system prompt
 */
export function getModelSpecsForPrompt(): string {
  return MODEL_SPECS.map(model => {
    const params = [...model.params.required, ...model.params.optional]
      .map(p => `  - ${p.name}: ${p.description}${p.options ? ` (options: ${p.options.join(', ')})` : ''}${p.default !== undefined ? ` [default: ${p.default}]` : ''}`)
      .join('\n')

    return `### ${model.name}
**Type**: ${model.type}
**When to use**: ${model.whenToUse}
**Description**: ${model.description}
**Capabilities**: ${Object.entries(model.capabilities).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Standard'}
**Parameters**:
${params}
${model.tips ? `**Tips**: ${model.tips.join('; ')}` : ''}
`
  }).join('\n')
}

/**
 * Get a simple list of models for quick reference
 */
export function getModelList(): { id: string; name: string; type: string }[] {
  return MODEL_SPECS.map(m => ({
    id: m.id,
    name: m.name,
    type: m.type,
  }))
}
