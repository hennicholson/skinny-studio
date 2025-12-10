// ============================================
// Skinny Studio - Type Definitions
// Ready for Whop SDK & Database Integration
// ============================================

// -------------------- User --------------------
export interface User {
  id: string
  whopUserId?: string
  email: string
  name: string
  avatar?: string
  createdAt: Date
  updatedAt?: Date
}

// -------------------- AI Models --------------------
export interface AIModel {
  id: string
  name: string
  provider: string
  description: string
  category: 'image' | 'video'
  tags: string[]
  capabilities?: {
    speed: 'fast' | 'medium' | 'slow'
    quality: 'draft' | 'standard' | 'high'
    textRendering?: boolean
  }
  replicateId?: string  // For Replicate API integration
}

// -------------------- Generation --------------------
export interface GenerationParams {
  width?: number
  height?: number
  steps?: number
  guidance?: number
  seed?: number
  negativePrompt?: string
}

export interface Generation {
  id: string
  userId?: string
  imageUrl: string
  prompt: string
  enhancedPrompt?: string
  referenceImages?: string[]
  model: {
    id: string
    name: string
    provider: string
  }
  parameters?: GenerationParams
  createdAt: Date
  updatedAt?: Date
  isPublic: boolean
  likes: number
  tags?: string[]
}

// -------------------- Workflow --------------------
export interface WorkflowStep {
  id: string
  order: number
  modelId: string
  modelName?: string
  promptTemplate: string
  usePreviousOutput: boolean
}

export interface Workflow {
  id: string
  userId?: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: Date
  updatedAt?: Date
  runCount: number
  lastRunAt?: Date
  isPublic: boolean
}

export interface WorkflowRunProgress {
  workflowId: string
  currentStep: number
  totalSteps: number
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  stepOutputs: Generation[]
  error?: string
}

// -------------------- Skills --------------------
export type SkillCategory = 'style' | 'technique' | 'tool' | 'workflow' | 'custom'

export interface Skill {
  id: string
  name: string
  description: string
  category: SkillCategory
  icon?: string  // emoji or icon name
  content: string  // The actual prompt guide/instructions
  tags: string[]
  isBuiltIn: boolean  // System-provided vs user-created
  isActive: boolean  // Can be toggled on/off
  shortcut?: string  // Quick reference like @product-photo
  examples?: string[]  // Example usages
  createdAt: Date
  updatedAt?: Date
  usageCount: number
}

export interface SkillReference {
  skillId: string
  skillName: string
  shortcut: string
}

// Built-in skills that come with the app
export const builtInSkills: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>[] = [
  {
    name: 'Product Photography',
    description: 'Professional e-commerce and product shot techniques',
    category: 'style',
    icon: '📦',
    content: `When creating product photos:
- Use clean, minimal backgrounds (white, gradient, or contextual lifestyle)
- Ensure proper lighting: soft diffused light, no harsh shadows
- Show the product at flattering angles (3/4 view often works best)
- Include subtle reflections or shadows for grounding
- Maintain consistent style across a product line
- Consider lifestyle context for emotional connection
- Use high resolution and sharp focus on the product`,
    tags: ['product', 'ecommerce', 'commercial', 'professional'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'product-photo',
    examples: [
      'Create a product photo of wireless earbuds @product-photo',
      'Professional shot of a skincare bottle @product-photo with marble background'
    ]
  },
  {
    name: 'Cinematic Style',
    description: 'Movie-like dramatic compositions and lighting',
    category: 'style',
    icon: '🎬',
    content: `For cinematic imagery:
- Use dramatic lighting with strong contrast (chiaroscuro)
- Compose with rule of thirds or golden ratio
- Include atmospheric elements: fog, rain, dust particles
- Use wide aspect ratios (16:9, 2.39:1) for epic feel
- Add depth with foreground elements
- Consider color grading: teal and orange, desaturated, noir
- Create visual storytelling with implied narrative`,
    tags: ['cinematic', 'dramatic', 'movie', 'film'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'cinematic',
    examples: [
      'A lone figure walking through neon-lit streets @cinematic',
      'Epic landscape at golden hour @cinematic with fog'
    ]
  },
  {
    name: 'Text & Typography',
    description: 'Best practices for text rendering in images',
    category: 'technique',
    icon: '✍️',
    content: `For images with text:
- Use Ideogram or FLUX Pro for best text rendering
- Keep text simple and legible
- Use high contrast between text and background
- Specify font style explicitly (bold, sans-serif, hand-written)
- Position text in areas with visual space
- Consider adding text glow or shadow for readability
- Limit to 3-5 words for best results`,
    tags: ['text', 'typography', 'logos', 'signage'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'text',
    examples: [
      'Coffee shop logo saying "BREW" @text modern minimal',
      'Motivational poster with "NEVER GIVE UP" @text bold typography'
    ]
  },
  {
    name: 'Portrait Lighting',
    description: 'Professional portrait and headshot techniques',
    category: 'technique',
    icon: '👤',
    content: `For portrait photography:
- Use Rembrandt, butterfly, or split lighting
- Ensure catch lights in the eyes
- Soft skin texture, avoid over-smoothing
- Background separation with shallow depth of field
- Natural or studio lighting specification
- Consider the mood: professional, casual, dramatic
- Specify ethnicity and age for diversity`,
    tags: ['portrait', 'headshot', 'people', 'faces'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'portrait',
    examples: [
      'Professional headshot of a business executive @portrait',
      'Dramatic portrait with Rembrandt lighting @portrait moody'
    ]
  },
  {
    name: 'Social Media Optimized',
    description: 'Formats and styles optimized for social platforms',
    category: 'workflow',
    icon: '📱',
    content: `For social media content:
- Instagram: 1:1 or 4:5 aspect ratio, vibrant colors
- Stories/TikTok: 9:16 vertical, bold visual hooks
- Twitter/X: 16:9, clear focal point
- Use trending aesthetics and color palettes
- Include space for text overlays if needed
- High saturation and contrast perform well
- Consider the platform's compression`,
    tags: ['social', 'instagram', 'tiktok', 'marketing'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'social',
    examples: [
      'Instagram post for a coffee brand @social vibrant',
      'TikTok thumbnail for a cooking video @social 9:16'
    ]
  }
]

// -------------------- Planning --------------------
export interface PlanningSession {
  id: string
  userId?: string
  rawIdea: string
  stylePreset?: string
  referenceImages: string[]
  enhancedPrompt: string
  suggestions: string[]
  selectedModel: string
  createdAt: Date
  usedAt?: Date
}

export type PlanningStep = 1 | 2 | 3

export interface PlanningState {
  step: PlanningStep
  rawIdea: string
  stylePreset: string | null
  referenceImages: File[]
  enhancedPrompt: string
  suggestions: string[]
  selectedModel: string
  isEnhancing: boolean
  error?: string
}

// -------------------- Toast --------------------
export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

// -------------------- App State --------------------
export interface AppSettings {
  recentModels: string[]
  favoriteModels: string[]
  defaultModel: string
  theme: 'dark' | 'light'
}

// -------------------- Mock Data --------------------
export const mockModels: AIModel[] = [
  {
    id: 'flux-pro',
    name: 'FLUX Pro',
    provider: 'Black Forest Labs',
    description: 'High-quality image generation with excellent prompt following',
    category: 'image',
    tags: ['fast', 'high-quality', 'photorealistic'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'black-forest-labs/flux-pro'
  },
  {
    id: 'flux-schnell',
    name: 'FLUX Schnell',
    provider: 'Black Forest Labs',
    description: 'Lightning-fast generation for quick iterations',
    category: 'image',
    tags: ['fastest', 'drafts', 'iterations'],
    capabilities: { speed: 'fast', quality: 'standard' },
    replicateId: 'black-forest-labs/flux-schnell'
  },
  {
    id: 'sdxl',
    name: 'Stable Diffusion XL',
    provider: 'Stability AI',
    description: 'Versatile image generation with fine control',
    category: 'image',
    tags: ['versatile', 'community', 'customizable'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'stability-ai/sdxl'
  },
  {
    id: 'sdxl-lightning',
    name: 'SDXL Lightning',
    provider: 'ByteDance',
    description: 'Ultra-fast SDXL variant with 4-step generation',
    category: 'image',
    tags: ['fast', '4-step', 'efficient'],
    capabilities: { speed: 'fast', quality: 'standard' },
    replicateId: 'bytedance/sdxl-lightning-4step'
  },
  {
    id: 'playground-v2.5',
    name: 'Playground v2.5',
    provider: 'Playground AI',
    description: 'Aesthetic-focused model for beautiful outputs',
    category: 'image',
    tags: ['aesthetic', 'artistic', 'stylized'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'playgroundai/playground-v2.5-1024px-aesthetic'
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    provider: 'Ideogram AI',
    description: 'Best-in-class text rendering in images',
    category: 'image',
    tags: ['text', 'typography', 'logos'],
    capabilities: { speed: 'medium', quality: 'high', textRendering: true },
    replicateId: 'ideogram-ai/ideogram-v2'
  },
  {
    id: 'recraft-v3',
    name: 'Recraft V3',
    provider: 'Recraft',
    description: 'Professional design-focused generation',
    category: 'image',
    tags: ['design', 'vectors', 'professional'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'recraft-ai/recraft-v3'
  },
  {
    id: 'minimax-video',
    name: 'MiniMax Video',
    provider: 'MiniMax',
    description: 'High-quality video generation from text',
    category: 'video',
    tags: ['video', 'animation', 'motion'],
    capabilities: { speed: 'slow', quality: 'high' },
    replicateId: 'minimax/video-01'
  },
]

export const mockGenerations: Generation[] = [
  {
    id: '1',
    imageUrl: 'https://picsum.photos/seed/gen1/800/1000',
    prompt: 'A futuristic cityscape at sunset with neon lights reflecting on wet streets, cyberpunk aesthetic',
    model: { id: 'flux-pro', name: 'FLUX Pro', provider: 'Black Forest Labs' },
    createdAt: new Date('2024-01-15'),
    isPublic: true,
    likes: 42
  },
  {
    id: '2',
    imageUrl: 'https://picsum.photos/seed/gen2/800/600',
    prompt: 'Minimalist product photography of a sleek white headphone on gradient background',
    model: { id: 'sdxl', name: 'Stable Diffusion XL', provider: 'Stability AI' },
    createdAt: new Date('2024-01-14'),
    isPublic: true,
    likes: 28
  },
  {
    id: '3',
    imageUrl: 'https://picsum.photos/seed/gen3/800/800',
    prompt: 'Portrait of a cyberpunk character with glowing neon tattoos, dramatic lighting',
    model: { id: 'flux-pro', name: 'FLUX Pro', provider: 'Black Forest Labs' },
    createdAt: new Date('2024-01-14'),
    isPublic: true,
    likes: 156
  },
  {
    id: '4',
    imageUrl: 'https://picsum.photos/seed/gen4/800/1200',
    prompt: 'Ethereal forest scene with bioluminescent plants and mystical fog',
    model: { id: 'playground-v2.5', name: 'Playground v2.5', provider: 'Playground AI' },
    createdAt: new Date('2024-01-13'),
    isPublic: true,
    likes: 89
  },
  {
    id: '5',
    imageUrl: 'https://picsum.photos/seed/gen5/800/700',
    prompt: 'Abstract geometric art with bold colors and sharp angles, modern design',
    model: { id: 'recraft-v3', name: 'Recraft V3', provider: 'Recraft' },
    createdAt: new Date('2024-01-13'),
    isPublic: false,
    likes: 12
  },
  {
    id: '6',
    imageUrl: 'https://picsum.photos/seed/gen6/800/900',
    prompt: 'Vintage car parked on a rainy Tokyo street at night, cinematic',
    model: { id: 'flux-schnell', name: 'FLUX Schnell', provider: 'Black Forest Labs' },
    createdAt: new Date('2024-01-12'),
    isPublic: true,
    likes: 67
  },
  {
    id: '7',
    imageUrl: 'https://picsum.photos/seed/gen7/800/500',
    prompt: 'Logo design for a tech startup called NEXUS, minimal and futuristic',
    model: { id: 'ideogram', name: 'Ideogram', provider: 'Ideogram AI' },
    createdAt: new Date('2024-01-12'),
    isPublic: true,
    likes: 34
  },
  {
    id: '8',
    imageUrl: 'https://picsum.photos/seed/gen8/800/1100',
    prompt: 'Surreal underwater scene with floating islands and exotic sea creatures',
    model: { id: 'sdxl-lightning', name: 'SDXL Lightning', provider: 'ByteDance' },
    createdAt: new Date('2024-01-11'),
    isPublic: true,
    likes: 203
  },
]

export const mockWorkflows: Workflow[] = [
  {
    id: 'w1',
    name: 'Product Photography',
    description: 'Generate and enhance professional product shots',
    steps: [
      { id: 's1', order: 1, modelId: 'flux-pro', modelName: 'FLUX Pro', promptTemplate: 'Professional product photo of {input} on clean white background, studio lighting', usePreviousOutput: false },
      { id: 's2', order: 2, modelId: 'recraft-v3', modelName: 'Recraft V3', promptTemplate: 'Enhance and add subtle shadows, professional product photography style', usePreviousOutput: true }
    ],
    createdAt: new Date('2024-01-10'),
    runCount: 15,
    isPublic: false
  },
  {
    id: 'w2',
    name: 'Social Media Pack',
    description: 'Create consistent visuals for social media posts',
    steps: [
      { id: 's1', order: 1, modelId: 'sdxl', modelName: 'Stable Diffusion XL', promptTemplate: 'Instagram-style {input}, vibrant colors, high engagement visual', usePreviousOutput: false },
      { id: 's2', order: 2, modelId: 'ideogram', modelName: 'Ideogram', promptTemplate: 'Add stylish text overlay with brand name', usePreviousOutput: true }
    ],
    createdAt: new Date('2024-01-08'),
    runCount: 42,
    isPublic: false
  },
  {
    id: 'w3',
    name: 'Character Design',
    description: 'Generate detailed character concepts from descriptions',
    steps: [
      { id: 's1', order: 1, modelId: 'flux-pro', modelName: 'FLUX Pro', promptTemplate: 'Character concept art of {input}, full body, detailed design', usePreviousOutput: false },
      { id: 's2', order: 2, modelId: 'playground-v2.5', modelName: 'Playground v2.5', promptTemplate: 'Same character, close-up portrait, dramatic lighting', usePreviousOutput: true },
      { id: 's3', order: 3, modelId: 'sdxl', modelName: 'Stable Diffusion XL', promptTemplate: 'Same character, action pose, dynamic composition', usePreviousOutput: true }
    ],
    createdAt: new Date('2024-01-05'),
    runCount: 8,
    isPublic: false
  },
]

// Style presets for Planning Mode
export const stylePresets = [
  { id: 'cinematic', name: 'Cinematic', description: 'Movie-like dramatic shots' },
  { id: 'product', name: 'Product', description: 'Clean commercial photography' },
  { id: 'portrait', name: 'Portrait', description: 'Character and face focused' },
  { id: 'landscape', name: 'Landscape', description: 'Scenic environments' },
  { id: 'abstract', name: 'Abstract', description: 'Artistic and conceptual' },
  { id: 'anime', name: 'Anime', description: 'Japanese animation style' },
  { id: 'photorealistic', name: 'Photorealistic', description: 'Indistinguishable from photos' },
  { id: '3d-render', name: '3D Render', description: 'CGI and 3D graphics' },
]
