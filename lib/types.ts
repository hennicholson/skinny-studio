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
  category: 'image' | 'video' | 'chat'
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
  },
  {
    name: 'Veo 3.1 Video Prompting',
    description: 'Professional video generation prompting for Google Veo 3.1',
    category: 'technique',
    icon: '🎥',
    content: `## Google Veo 3.1 Prompting Guide

### The Veo Formula
Structure prompts as: [Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]

### Optimal Prompt Length
- 3-6 sentences (100-150 words) works best
- Front-load critical visual elements
- Be specific but not overly verbose

### Camera Movements
- **Dolly**: Camera moves toward/away from subject
- **Tracking**: Camera follows subject movement
- **Crane/Jib**: Vertical camera movement
- **Pan**: Horizontal rotation from fixed point
- **Tilt**: Vertical rotation from fixed point
- **Vertigo/Dolly Zoom**: Zoom in while moving back (or vice versa)
- **POV**: First-person perspective shot
- **Handheld**: Natural, documentary-style movement
- **Static**: Fixed camera position

### Lens & Framing
- 35mm lens (cinematic standard)
- 50mm lens (portrait-friendly)
- Wide-angle lens (expansive scenes)
- Shallow depth of field (background blur)
- Deep focus (everything sharp)

### Lighting Keywords
- Golden hour, blue hour
- Low-key lighting (dramatic shadows)
- High-key lighting (bright, minimal shadows)
- Rembrandt lighting (portrait)
- Backlit, silhouette
- Neon lighting, practical lights

### Timestamp Prompting (Multi-Shot)
For complex sequences, use timestamps:
\`[00:00-00:02] Medium shot of character entering room\`
\`[00:02-00:04] Close-up on character's face showing surprise\`
\`[00:04-00:06] Wide establishing shot revealing the situation\`

### Important Tips
- Add "(no subtitles)" multiple times to prevent unwanted text
- Text rendering is unreliable - use post-production overlays
- Specify ethnicity/appearance for consistent characters
- Include ambient sound descriptions for audio generation
- Use film references: "in the style of Blade Runner"

### Quality Boosters
- "Cinematic quality, film grain"
- "Professional color grading"
- "8K resolution, sharp detail"
- "Award-winning cinematography"`,
    tags: ['video', 'veo', 'google', 'cinematic', 'motion', 'ai-video'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'veo',
    examples: [
      'Cinematic dolly shot of a samurai walking through misty bamboo forest @veo',
      'POV handheld shot running through neon-lit Tokyo streets at night @veo',
      '@veo tracking shot following a dancer, golden hour lighting, shallow depth of field'
    ]
  },
  {
    name: 'Sequential Storyboard',
    description: 'Generate multiple connected images as a visual sequence or storyboard with Seedream 4.5',
    category: 'workflow',
    icon: '🎬',
    content: `## Sequential Storyboard Generation (Seedream 4.5)

Use this skill to create multi-image sequences like:
- Storyboards (sequential scenes telling a story)
- Character variations (same character, different poses/expressions)
- Style exploration sheets
- Visual narratives / comic panels
- Brand asset variations

### How to Structure Sequential Prompts

Always use this template format for best results:

\`\`\`
Generate [NUMBER] separate images sequentially. Each is a complete standalone [ASPECT_RATIO] photo.

**Shared Visual Elements:**
- Lighting: [describe consistent lighting, e.g., "golden hour", "dramatic shadows"]
- Color palette: [describe colors, e.g., "warm amber/sage/gold/teal"]
- Camera: [describe lens/style, e.g., "35mm f/2.8, cinematic composition"]
- Style: [describe overall aesthetic, e.g., "professional corporate photography"]

**Image 1:** [SCENE - establishing shot or introduction]
**Image 2:** [SCENE - development or progression]
**Image 3:** [SCENE - key moment or climax]
**Image 4:** [SCENE - resolution or conclusion]
... (continue for each image)

Maintain exact visual continuity across all images.
\`\`\`

### Key Parameters
- **Number of images**: 1-15 (charged per image generated: 7¢ each)
- **Aspect ratios**: 1:1, 16:9, 9:16, 3:2, 2:3, 4:3, 3:4
- **sequential_image_generation**: "auto" (enables multi-image mode)
- **max_images**: Set to your desired count

### Example: 5-Panel Corporate Brand Story

\`\`\`
Generate 5 separate images sequentially. Each is a complete standalone 16:9 photo.

**Shared Visual Elements:**
- Lighting: Golden hour lighting through large windows
- Color palette: Warm amber, sage green, natural wood tones
- Camera: 35mm f/2.8, professional corporate photography
- Style: Modern, authentic, aspirational

**Image 1:** Wide establishing shot of a bright, modern open-plan office with a diverse team collaborating around a large wooden table
**Image 2:** Medium shot of two colleagues having an energetic brainstorming session at a whiteboard
**Image 3:** Close-up of hands typing on a laptop, coffee cup nearby, warm sunlight streaming in
**Image 4:** Team members celebrating a small win, genuine smiles, casual high-fives
**Image 5:** Single professional walking confidently through a glass-walled corridor, city skyline visible

Maintain exact visual continuity across all images.
\`\`\`

### Pricing
- 7¢ per image generated
- Example: 5 images = ~35¢
- You're charged based on actual images produced`,
    tags: ['storyboard', 'sequential', 'multi-image', 'seedream', 'narrative', 'comic', 'variations'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'storyboard',
    examples: [
      'Create a 5-panel storyboard of a day in the life of a barista @storyboard',
      '@storyboard 7-image brand story for a tech startup',
      'Generate character variations: same person in 4 different emotions @storyboard'
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
// These models match the studio_models database table
export const mockModels: AIModel[] = [
  // === CHAT MODE ===
  {
    id: 'creative-consultant',
    name: 'Creative Consultant',
    provider: 'Gemini 2.5 Flash',
    description: 'Brainstorm ideas, build prompts, and plan creative projects without generating',
    category: 'chat',
    tags: ['brainstorm', 'planning', 'free'],
    capabilities: { speed: 'fast', quality: 'high' },
  },
  {
    id: 'storyboard-mode',
    name: 'Storyboard Mode',
    provider: 'Skinny Studio',
    description: 'Plan multi-shot projects with entities for characters, worlds, objects, and styles',
    category: 'chat',
    tags: ['storyboard', 'planning', 'shots', 'entities'],
    capabilities: { speed: 'fast', quality: 'high' },
  },
  // === IMAGE MODELS ===
  {
    id: 'seedream-4.5',
    name: 'Seedream 4.5',
    provider: 'ByteDance',
    description: 'Exceptional quality with up to 4K resolution and multi-reference support',
    category: 'image',
    tags: ['4K', 'high-quality', 'references', 'premium'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'bytedance/seedream-4.5'
  },
  {
    id: 'flux-2-pro',
    name: 'FLUX 2 Pro',
    provider: 'Black Forest Labs',
    description: 'Latest FLUX with 4MP resolution and up to 8 reference images',
    category: 'image',
    tags: ['4MP', 'references', 'premium', 'state-of-the-art'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'black-forest-labs/flux-2-pro'
  },
  {
    id: 'flux-2-dev',
    name: 'FLUX 2 Dev',
    provider: 'Black Forest Labs',
    description: 'Development version of FLUX 2 with great quality at lower cost',
    category: 'image',
    tags: ['fast', 'high-quality', 'photorealistic'],
    capabilities: { speed: 'fast', quality: 'high' },
    replicateId: 'black-forest-labs/flux-2-dev'
  },
  {
    id: 'nano-banana',
    name: 'Nano Banana',
    provider: 'Google',
    description: 'Efficient model with excellent multi-image reference and style transfer',
    category: 'image',
    tags: ['fast', 'references', 'style-transfer'],
    capabilities: { speed: 'fast', quality: 'high' },
    replicateId: 'google/nano-banana'
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'Google',
    description: 'Premium version with 1K/2K resolution output',
    category: 'image',
    tags: ['premium', 'high-res', '2K'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'google/nano-banana-pro'
  },
  {
    id: 'nano-banana-pro-4k',
    name: 'Nano Banana Pro 4K',
    provider: 'Google',
    description: 'Ultra-high resolution 4K output for professional use',
    category: 'image',
    tags: ['premium', '4K', 'ultra-res'],
    capabilities: { speed: 'slow', quality: 'high' },
    replicateId: 'google/nano-banana-pro-4k'
  },
  {
    id: 'p-image-edit',
    name: 'P-Image Edit',
    provider: 'Replicate',
    description: 'Budget-friendly image editing and manipulation',
    category: 'image',
    tags: ['edit', 'budget', 'manipulation'],
    capabilities: { speed: 'fast', quality: 'standard' },
    replicateId: 'replicate/p-image-edit'
  },
  {
    id: 'qwen-image-edit-plus',
    name: 'Qwen Image Edit Plus',
    provider: 'Alibaba',
    description: 'Advanced image editing with instruction following',
    category: 'image',
    tags: ['edit', 'instructions', 'manipulation'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'alibaba/qwen-image-edit-plus'
  },
  // === VIDEO MODELS ===
  {
    id: 'veo-3.1',
    name: 'Veo 3.1',
    provider: 'Google',
    description: 'Premium video generation with audio support (25¢/s without audio, 50¢/s with audio)',
    category: 'video',
    tags: ['premium', 'audio', 'cinematic'],
    capabilities: { speed: 'slow', quality: 'high' },
    replicateId: 'google/veo-3.1'
  },
  {
    id: 'veo-3.1-fast',
    name: 'Veo 3.1 Fast',
    provider: 'Google',
    description: 'Faster Veo generation (15¢/s without audio, 25¢/s with audio)',
    category: 'video',
    tags: ['fast', 'audio', 'efficient'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'google/veo-3.1-fast'
  },
  {
    id: 'wan-2.5-t2v',
    name: 'Wan 2.5 T2V',
    provider: 'Alibaba',
    description: 'Text-to-video with resolution pricing (480p: 8¢/s, 720p: 13¢/s, 1080p: 20¢/s)',
    category: 'video',
    tags: ['t2v', 'multi-res', 'budget'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'alibaba/wan-2.5-t2v'
  },
  {
    id: 'wan-2.5-i2v',
    name: 'Wan 2.5 I2V',
    provider: 'Alibaba',
    description: 'Image-to-video generation with resolution pricing',
    category: 'video',
    tags: ['i2v', 'multi-res', 'references'],
    capabilities: { speed: 'medium', quality: 'high' },
    replicateId: 'alibaba/wan-2.5-i2v'
  },
  {
    id: 'kling-v2.5-turbo-pro',
    name: 'Kling V2.5 Turbo Pro',
    provider: 'Kuaishou',
    description: 'Fast professional video at 15¢/second',
    category: 'video',
    tags: ['fast', 'professional', 'turbo'],
    capabilities: { speed: 'fast', quality: 'high' },
    replicateId: 'kuaishou/kling-v2.5-turbo-pro'
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

// -------------------- Storyboard System --------------------

// Entity types for storyboard consistency
export type EntityType = 'character' | 'world' | 'object' | 'style'

// Folder types (extends library_folders)
export type FolderType = 'general' | EntityType

export interface StoryboardEntity {
  id: string
  storyboardId: string
  entityType: EntityType
  entityName: string
  entityDescription?: string
  folderId?: string
  generationId?: string
  primaryImageUrl: string
  visionContext?: string // Gemini-analyzed visual description
  sortOrder: number
  createdAt: string
}

export interface CreateEntityInput {
  entityType: EntityType
  entityName: string
  folderId?: string
  generationId?: string
  imageUrl: string
}

export interface StoryboardShot {
  id: string
  storyboardId: string
  shotNumber: number
  sortOrder: number
  title?: string
  description: string
  cameraAngle?: string
  cameraMovement?: string
  durationSeconds: number
  mediaType: 'image' | 'video'

  // Generation link
  generationId?: string
  prompt?: string
  modelSlug?: string
  status: 'pending' | 'generating' | 'completed' | 'error'
  generatedImageUrl?: string  // URL of the generated image (populated from generation)

  // AI suggestions
  aiSuggestedPrompt?: string
  aiNotes?: string

  // Timestamps
  createdAt: string
  updatedAt: string
  generatedAt?: string

  // Entity references (populated from shot_entity_references)
  entities?: ShotEntityReference[]
}

export interface ShotEntityReference {
  id: string
  shotId: string
  entityId: string
  role?: string
  notes?: string
  entity?: StoryboardEntity // Populated via join
}

export interface Storyboard {
  id: string
  whopUserId: string
  title: string
  description?: string
  genre?: string
  mood?: string
  styleNotes?: string

  // Settings
  conversationId?: string
  defaultAspectRatio: string
  defaultModelSlug: string

  // Status
  status: 'planning' | 'in_progress' | 'completed'
  totalShots: number
  completedShots: number

  // Timestamps
  createdAt: string
  updatedAt: string

  // Populated relations
  shots?: StoryboardShot[]
  entities?: StoryboardEntity[]
}

export interface CreateStoryboardInput {
  title?: string
  description?: string
  genre?: string
  mood?: string
  styleNotes?: string
  defaultAspectRatio?: string
  defaultModelSlug?: string
}

export interface UpdateStoryboardInput {
  title?: string
  description?: string
  genre?: string
  mood?: string
  styleNotes?: string
  defaultAspectRatio?: string
  defaultModelSlug?: string
  status?: 'planning' | 'in_progress' | 'completed'
}

export interface CreateShotInput {
  title?: string
  description: string
  cameraAngle?: string
  cameraMovement?: string
  durationSeconds?: number
  mediaType?: 'image' | 'video'
  aiSuggestedPrompt?: string
  aiNotes?: string
}

export interface UpdateShotInput {
  title?: string
  description?: string
  cameraAngle?: string
  cameraMovement?: string
  durationSeconds?: number
  mediaType?: 'image' | 'video'
  prompt?: string
  modelSlug?: string
  status?: 'pending' | 'generating' | 'completed' | 'error'
  aiSuggestedPrompt?: string
  aiNotes?: string
}

// Entity badge colors for UI
export const entityTypeColors: Record<EntityType, { bg: string; text: string; icon: string }> = {
  character: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '👤' },
  world: { bg: 'bg-green-500/20', text: 'text-green-400', icon: '🌍' },
  object: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '🔧' },
  style: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: '🎨' },
}

// Folder type display config
export const folderTypeConfig: Record<FolderType, { label: string; icon: string; color: string }> = {
  general: { label: 'General', icon: '📁', color: 'text-zinc-400' },
  character: { label: 'Character', icon: '👤', color: 'text-blue-400' },
  world: { label: 'World', icon: '🌍', color: 'text-green-400' },
  object: { label: 'Object', icon: '🔧', color: 'text-orange-400' },
  style: { label: 'Style', icon: '🎨', color: 'text-purple-400' },
}
