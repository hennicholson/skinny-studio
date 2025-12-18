export interface AIModel {
  id: string
  name: string
  provider: string
  description: string
  category: 'image' | 'video' | 'chat'
  tags: string[]
}

export interface Generation {
  id: string
  imageUrl: string
  prompt: string
  modelId: string
  modelName: string
  timestamp: Date
  status: 'pending' | 'generating' | 'completed' | 'failed'
  // Legacy fields for gallery compatibility
  model?: {
    id: string
    name: string
    provider: string
  }
  createdAt?: Date
  isPublic?: boolean
  likes?: number
}

export interface WorkflowStep {
  id: string
  modelId: string
  promptTemplate: string
  order: number
}

export interface Workflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: Date
  runCount: number
}

// Mock AI Models
export const mockModels: AIModel[] = [
  {
    id: 'creative-consultant',
    name: 'Creative Consultant',
    provider: 'Skinny Studio',
    description: 'Brainstorm ideas, build prompts, and plan creative projects without generating',
    category: 'chat',
    tags: ['brainstorm', 'planning', 'free']
  },
  {
    id: 'storyboard-mode',
    name: 'Storyboard Mode',
    provider: 'Skinny Studio',
    description: 'Plan multi-shot creative projects with AI assistance, entity management, and timeline view',
    category: 'chat',
    tags: ['storyboard', 'planning', 'shots']
  },
  {
    id: 'flux-pro',
    name: 'FLUX Pro',
    provider: 'Black Forest Labs',
    description: 'High-quality image generation with excellent prompt following',
    category: 'image',
    tags: ['fast', 'high-quality', 'photorealistic']
  },
  {
    id: 'flux-schnell',
    name: 'FLUX Schnell',
    provider: 'Black Forest Labs',
    description: 'Lightning-fast generation for quick iterations',
    category: 'image',
    tags: ['fastest', 'drafts', 'iterations']
  },
  {
    id: 'sdxl',
    name: 'Stable Diffusion XL',
    provider: 'Stability AI',
    description: 'Versatile image generation with fine control',
    category: 'image',
    tags: ['versatile', 'community', 'customizable']
  },
  {
    id: 'sdxl-lightning',
    name: 'SDXL Lightning',
    provider: 'ByteDance',
    description: 'Ultra-fast SDXL variant with 4-step generation',
    category: 'image',
    tags: ['fast', '4-step', 'efficient']
  },
  {
    id: 'playground-v2.5',
    name: 'Playground v2.5',
    provider: 'Playground AI',
    description: 'Aesthetic-focused model for beautiful outputs',
    category: 'image',
    tags: ['aesthetic', 'artistic', 'stylized']
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    provider: 'Ideogram AI',
    description: 'Best-in-class text rendering in images',
    category: 'image',
    tags: ['text', 'typography', 'logos']
  },
  {
    id: 'recraft-v3',
    name: 'Recraft V3',
    provider: 'Recraft',
    description: 'Professional design-focused generation',
    category: 'image',
    tags: ['design', 'vectors', 'professional']
  },
  {
    id: 'minimax-video',
    name: 'MiniMax Video',
    provider: 'MiniMax',
    description: 'High-quality video generation from text',
    category: 'video',
    tags: ['video', 'animation', 'motion']
  },
]

// Mock Generations
export const mockGenerations: Generation[] = [
  {
    id: '1',
    imageUrl: 'https://picsum.photos/seed/gen1/800/1000',
    prompt: 'A futuristic cityscape at sunset with neon lights reflecting on wet streets, cyberpunk aesthetic',
    modelId: 'flux-pro',
    modelName: 'FLUX Pro',
    timestamp: new Date('2024-01-15'),
    status: 'completed',
    isPublic: true,
    likes: 42
  },
  {
    id: '2',
    imageUrl: 'https://picsum.photos/seed/gen2/800/600',
    prompt: 'Minimalist product photography of a sleek white headphone on gradient background',
    modelId: 'sdxl',
    modelName: 'Stable Diffusion XL',
    timestamp: new Date('2024-01-14'),
    status: 'completed',
    isPublic: true,
    likes: 28
  },
  {
    id: '3',
    imageUrl: 'https://picsum.photos/seed/gen3/800/800',
    prompt: 'Portrait of a cyberpunk character with glowing neon tattoos, dramatic lighting',
    modelId: 'flux-pro',
    modelName: 'FLUX Pro',
    timestamp: new Date('2024-01-14'),
    status: 'completed',
    isPublic: true,
    likes: 156
  },
  {
    id: '4',
    imageUrl: 'https://picsum.photos/seed/gen4/800/1200',
    prompt: 'Ethereal forest scene with bioluminescent plants and mystical fog',
    modelId: 'playground-v2.5',
    modelName: 'Playground v2.5',
    timestamp: new Date('2024-01-13'),
    status: 'completed',
    isPublic: true,
    likes: 89
  },
  {
    id: '5',
    imageUrl: 'https://picsum.photos/seed/gen5/800/700',
    prompt: 'Abstract geometric art with bold colors and sharp angles, modern design',
    modelId: 'recraft-v3',
    modelName: 'Recraft V3',
    timestamp: new Date('2024-01-13'),
    status: 'completed',
    isPublic: false,
    likes: 12
  },
  {
    id: '6',
    imageUrl: 'https://picsum.photos/seed/gen6/800/900',
    prompt: 'Vintage car parked on a rainy Tokyo street at night, cinematic',
    modelId: 'flux-schnell',
    modelName: 'FLUX Schnell',
    timestamp: new Date('2024-01-12'),
    status: 'completed',
    isPublic: true,
    likes: 67
  },
  {
    id: '7',
    imageUrl: 'https://picsum.photos/seed/gen7/800/500',
    prompt: 'Logo design for a tech startup called NEXUS, minimal and futuristic',
    modelId: 'ideogram',
    modelName: 'Ideogram',
    timestamp: new Date('2024-01-12'),
    status: 'completed',
    isPublic: true,
    likes: 34
  },
  {
    id: '8',
    imageUrl: 'https://picsum.photos/seed/gen8/800/1100',
    prompt: 'Surreal underwater scene with floating islands and exotic sea creatures',
    modelId: 'sdxl-lightning',
    modelName: 'SDXL Lightning',
    timestamp: new Date('2024-01-11'),
    status: 'completed',
    isPublic: true,
    likes: 203
  },
]

// Mock Workflows
export const mockWorkflows: Workflow[] = [
  {
    id: 'w1',
    name: 'Product Photography',
    description: 'Generate and enhance professional product shots',
    steps: [
      { id: 's1', modelId: 'flux-pro', promptTemplate: 'Professional product photo of {subject} on clean white background, studio lighting', order: 1 },
      { id: 's2', modelId: 'recraft-v3', promptTemplate: 'Enhance and add subtle shadows, professional product photography style', order: 2 }
    ],
    createdAt: new Date('2024-01-10'),
    runCount: 15
  },
  {
    id: 'w2',
    name: 'Social Media Pack',
    description: 'Create consistent visuals for social media posts',
    steps: [
      { id: 's1', modelId: 'sdxl', promptTemplate: 'Instagram-style {subject}, vibrant colors, high engagement visual', order: 1 },
      { id: 's2', modelId: 'ideogram', promptTemplate: 'Add stylish text overlay: {text}', order: 2 }
    ],
    createdAt: new Date('2024-01-08'),
    runCount: 42
  },
  {
    id: 'w3',
    name: 'Character Design',
    description: 'Generate detailed character concepts from descriptions',
    steps: [
      { id: 's1', modelId: 'flux-pro', promptTemplate: 'Character concept art of {description}, full body, detailed design', order: 1 },
      { id: 's2', modelId: 'playground-v2.5', promptTemplate: 'Same character, close-up portrait, dramatic lighting', order: 2 },
      { id: 's3', modelId: 'sdxl', promptTemplate: 'Same character, action pose, dynamic composition', order: 3 }
    ],
    createdAt: new Date('2024-01-05'),
    runCount: 8
  },
]
