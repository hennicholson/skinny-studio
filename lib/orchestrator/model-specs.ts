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
  type: 'text-to-image' | 'image-to-image' | 'video' | 'upscale'
  capabilities: {
    textRendering?: boolean
    multipleReferences?: boolean
    lastFrame?: boolean
    controlNet?: boolean
    inpainting?: boolean
    outpainting?: boolean
  }
  params: {
    required: ParamSpec[]
    optional: ParamSpec[]
  }
  description: string
  whenToUse: string
  tips?: string[]
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
          name: 'size',
          type: 'enum',
          description: 'Image resolution',
          options: ['2K', '4K', 'custom'],
          default: '2K',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio',
          options: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
          default: '1:1',
        },
        {
          name: 'image_input',
          type: 'image',
          description: 'Input images for image-to-image generation (1-14 images)',
        },
      ],
    },
    description: 'ByteDance\'s latest model with exceptional quality and up to 4K resolution.',
    whenToUse: 'Use for high-resolution professional work, complex scenes, and when you need the highest quality output.',
    tips: [
      'Supports up to 4K resolution',
      'Can use multiple reference images',
      'Excellent for detailed, cinematic imagery',
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
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Image aspect ratio',
          options: ['1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3', 'custom'],
          default: '1:1',
        },
        {
          name: 'resolution',
          type: 'enum',
          description: 'Resolution in megapixels',
          options: ['0.5 MP', '1 MP', '2 MP', '4 MP'],
          default: '1 MP',
        },
        {
          name: 'input_images',
          type: 'image',
          description: 'Input images for image-to-image (max 8 images)',
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
        {
          name: 'safety_tolerance',
          type: 'number',
          description: 'Safety tolerance (1=strict, 5=permissive)',
          default: 2,
          range: { min: 1, max: 5 },
        },
      ],
    },
    description: 'The latest FLUX model with state-of-the-art quality and image-to-image support.',
    whenToUse: 'Use for professional work, commercial projects, and when you need the best FLUX quality.',
    tips: [
      'Supports up to 4MP resolution',
      'Up to 8 reference images for image-to-image',
      'Best overall FLUX model',
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
    },
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
          description: 'Input images to transform or use as reference',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          description: 'Aspect ratio of the generated image',
          options: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
          default: '1:1',
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
    description: 'Google\'s efficient model with excellent multi-image reference support.',
    whenToUse: 'Use when you have reference images and want to transform or apply styles from them.',
    tips: [
      'Great for style transfer',
      'Supports multiple reference images',
      'Fast and efficient',
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
          options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
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
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
      ],
    },
    description: 'Fast, high-quality image generation. Best for quick iterations and general use.',
    whenToUse: 'Use for fast previews, general images, when speed matters more than maximum quality.',
    tips: [
      'Great for rapid prototyping',
      'Handles text in images reasonably well',
      'Best for standard aspect ratios',
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
          options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
          default: '1:1',
        },
        {
          name: 'guidance',
          type: 'number',
          description: 'How closely to follow the prompt',
          default: 3.5,
          range: { min: 1, max: 10 },
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          description: 'Quality vs speed tradeoff',
          default: 28,
          range: { min: 1, max: 50 },
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
      ],
    },
    description: 'Higher quality version with more control. Best for final outputs.',
    whenToUse: 'Use when quality matters most, for final renders, portfolio pieces, or detailed work.',
    tips: [
      'More detailed and accurate than Schnell',
      'Better for complex scenes',
      'Slower but higher quality',
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
          options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
          default: '1:1',
        },
        {
          name: 'safety_tolerance',
          type: 'number',
          description: 'Content safety threshold',
          default: 2,
          range: { min: 1, max: 6 },
        },
        {
          name: 'output_format',
          type: 'enum',
          description: 'Output image format',
          options: ['webp', 'jpg', 'png'],
          default: 'webp',
        },
      ],
    },
    description: 'State-of-the-art quality with enhanced prompt understanding.',
    whenToUse: 'Use for the highest quality professional work, commercial projects, hero images.',
    tips: [
      'Best overall quality in the FLUX family',
      'Excellent prompt adherence',
      'Premium option for important outputs',
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
          name: 'num_inference_steps',
          type: 'number',
          description: 'Number of denoising steps',
          default: 25,
          range: { min: 1, max: 50 },
        },
        {
          name: 'guidance_scale',
          type: 'number',
          description: 'How closely to follow the prompt',
          default: 7.5,
          range: { min: 1, max: 20 },
        },
        {
          name: 'scheduler',
          type: 'enum',
          description: 'Sampling scheduler',
          options: ['DDIM', 'DPMSolverMultistep', 'HeunDiscrete', 'K_EULER', 'K_EULER_ANCESTRAL', 'PNDM'],
          default: 'DPMSolverMultistep',
        },
      ],
    },
    description: 'Versatile model with extensive customization options.',
    whenToUse: 'Use when you need negative prompts, specific dimensions, or advanced control.',
    tips: [
      'Negative prompts help avoid unwanted elements',
      'Good for artistic styles',
      'More parameter control than FLUX',
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
          description: 'Visual style of the output',
          options: ['any', 'realistic_image', 'digital_illustration', 'vector_illustration', 'icon'],
          default: 'any',
        },
        {
          name: 'size',
          type: 'enum',
          description: 'Output image size',
          options: ['1024x1024', '1365x1024', '1024x1365', '1536x1024', '1024x1536', '1820x1024', '1024x1820', '1024x2048', '2048x1024', '1434x1024', '1024x1434', '1024x1280', '1280x1024', '1024x1707', '1707x1024'],
          default: '1024x1024',
        },
      ],
    },
    description: 'Excellent for design work, illustrations, and icons.',
    whenToUse: 'Use for vector graphics, icons, digital illustrations, and design assets.',
    tips: [
      'Best for clean, design-focused outputs',
      'Great for icons and illustrations',
      'Excellent text rendering',
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
          description: 'Image aspect ratio',
          options: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
          default: '1:1',
        },
        {
          name: 'style_type',
          type: 'enum',
          description: 'Visual style',
          options: ['Auto', 'General', 'Realistic', 'Design', 'Render 3D', 'Anime'],
          default: 'Auto',
        },
      ],
    },
    description: 'Industry-leading text rendering in images.',
    whenToUse: 'Use when you need text, logos, posters, signage, or typography in your images.',
    tips: [
      'Best-in-class text rendering',
      'Great for posters and marketing',
      'Handles complex typography',
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
