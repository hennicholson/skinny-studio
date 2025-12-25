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
  recommendedModels?: string[]  // Model slugs this skill works best with
  createdAt: Date
  updatedAt?: Date
  usageCount: number
}

export interface SkillReference {
  skillId: string
  skillName: string
  shortcut: string
}

// Built-in skills that come with the app - December 2025 Research-Backed Update
export const builtInSkills: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>[] = [
  // ============================================
  // IMAGE MODEL SKILLS
  // ============================================
  {
    name: 'FLUX 2 Pro/Dev Mastery',
    description: 'Research-backed prompting guide for FLUX 2 models (Dec 2025)',
    category: 'technique',
    icon: '⚡',
    content: `## FLUX 2 Pro/Dev Prompting Guide (Dec 2025)

### The FLUX Formula
Structure by importance: Subject → Action → Style → Context
FLUX weighs earlier information more heavily—place critical requirements first.

### Key Techniques

**Natural Language Over Tags:**
- Skip quality tags like "masterpiece, 8k, ultra detailed"—FLUX 2 doesn't need them
- Natural language prompts match or exceed keyword-heavy equivalents
- "A photographer captures a model in golden hour light" beats tag soup

**Optimal Prompt Length:**
- Medium prompts (30-80 words) work best for most projects
- Long prompts (80+ words) for complex scenes with detailed specs

**JSON Structured Prompting:**
For precise control, use JSON format:
{
  "subject": "young woman with flowing red hair",
  "camera": "85mm f/1.4, shallow DOF",
  "lighting": "golden hour backlighting",
  "style": "editorial fashion photography"
}

**HEX Color Control:**
- Specify exact colors: "product in color #1A1A1A with #FFD700 accents"
- Always associate hex codes with specific objects

**Camera & Lens Signatures:**
- "Shot on Fujifilm X-T5, 35mm f/1.4" produces authentic results
- Reference specific eras, cameras, and film stocks for distinctive looks

**Multi-Reference Images:**
- FLUX 2 Pro supports up to 8 reference images
- Keep prompts simple when using references—let images carry visual info
- Reference by number: "Use the pose from image 1, style from image 2"

**Prompt Upsampling:**
- Enable \`prompt_upsampling\` parameter for automatic enhancement
- Your intent is preserved while visual elements are expanded

### What NOT to Do
- No negative prompts—describe what you WANT, not what to avoid
- Skip quality boosters—the model handles this natively
- Avoid vague descriptions—be specific about everything`,
    tags: ['flux', 'flux-2', 'black-forest-labs', 'photorealistic', 'references', 'json-prompting'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'flux2',
    recommendedModels: ['flux-2-pro', 'flux-2-dev'],
    examples: [
      'Portrait shot on Fujifilm X-T5, 85mm f/1.4 @flux2',
      'Product in color #1A1A1A with #FFD700 accents @flux2'
    ]
  },
  {
    name: 'Seedream 4.5 Sequential',
    description: 'Multi-image consistency and sequential generation with Seedream 4.5 (Dec 2025)',
    category: 'technique',
    icon: '🌱',
    content: `## Seedream 4.5 Prompting Guide (Dec 2025)

### The Seedream Formula
Natural language: Subject + Action + Environment + [Style/Lighting/Composition]

### Core Principles

**Concise Over Complex:**
- Seedream 4.5 has stronger text understanding than predecessors
- Precise, concise prompts beat ornate vocabulary stacking
- ✅ "Girl walking under parasol on tree-lined path, Monet oil painting style"
- ❌ "Girl, umbrella, tree-lined street, oil painting texture"

**Lighting Keywords (Highly Responsive):**
- "Golden hour lighting" / "Blue hour"
- "Dramatic side lighting" / "Soft diffused light"
- "Moody low-key lighting" / "Bright high-key lighting"

**Technical Specifications:**
- "Shot on 85mm lens, shallow depth of field"
- "4K detail, high resolution"
- "Cinematic composition, rule of thirds"

**Text in Images:**
- Use quotation marks: 'Generate a poster with title "Seedream 4.5"'
- Avoid: Generate a poster titled Seedream 4.5

### Multi-Image Generation (Key Feature)
Seedream 4.5 excels at generating up to 14 consistent images:

**Template for Sequential Generation:**
Generate [NUMBER] separate images sequentially. Each is a complete standalone [ASPECT_RATIO] photo.

**Shared Visual Elements:**
- Lighting: [describe consistent lighting]
- Color palette: [describe colors]
- Camera: [describe lens/style]
- Style: [describe overall aesthetic]

**Image 1:** [SCENE]
**Image 2:** [SCENE]
...

Maintain exact visual continuity across all images.

### Character Consistency
- Upload 1-3 reference images for character designs
- ID retention is industry-leading—fewer "surprise cousins"
- Supports drastic style transfers while keeping identity recognizable

### Pricing
- 7¢ per image generated
- Example: 5 images = ~35¢`,
    tags: ['seedream', 'bytedance', 'sequential', 'multi-image', 'consistency', '4k'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'seedream',
    recommendedModels: ['seedream-4.5'],
    examples: [
      'Generate 5 sequential brand story images @seedream',
      'Character in 4 different poses, consistent identity @seedream'
    ]
  },
  {
    name: 'Nano Banana Pro',
    description: 'Google\'s Gemini-powered "Thinking" image model guide (Dec 2025)',
    category: 'technique',
    icon: '🍌',
    content: `## Nano Banana Pro Prompting Guide (Dec 2025)

### Understanding Nano Banana Pro
This is Google's Gemini 3 Pro Image model—a "Thinking" model that understands intent, physics, and composition.

### The Prompt Structure
[Subject + Adjectives] doing [Action] in [Location/Context]. [Composition/Camera Angle]. [Lighting/Atmosphere]. [Style/Media].

### Key Principles

**Act Like a Creative Director:**
- Stop using "tag soups" (dog, park, 4k, realistic)
- You don't need "4k, trending on artstation, masterpiece" spam
- Be descriptive, not repetitive

**Professional Technical Control:**
Replace vague adjectives with precise instructions:
- ❌ "zoom" → ✅ "85mm lens at f/8"
- ❌ "good light" → ✅ "three-point lighting with key at 45°"

**Keep Initial Prompts Concise:**
- Prompts under 25 words achieve 30% higher accuracy for composition
- Once your base works, refine with more details

**Conversational Editing (Key Feature):**
If an image is 80% correct, don't regenerate from scratch:
- "That's great, but change the lighting to sunset"
- "Make the text neon blue"
- "Move the subject to the left third"

### Key Capabilities

**Multi-Image Blending:**
- Up to 14 reference images
- Maintain consistency of up to 5 people
- Use for character sheets, product variations, style consistency

**Resolution Options:**
- Standard: 1K output
- Pro: 2K output
- Pro 4K: Ultra-high resolution for print

### Best Practices
- Specify viewpoints: "eye-level, low-angle, close-up portrait, rule of thirds"
- Reference specific photography terminology
- Use conversational follow-ups for refinement`,
    tags: ['nano-banana', 'google', 'gemini', 'thinking-model', 'conversational', 'multi-reference'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'nano',
    recommendedModels: ['nano-banana', 'nano-banana-pro', 'nano-banana-pro-4k'],
    examples: [
      'Portrait with three-point lighting, key at 45° @nano',
      'Blend reference images for consistent character @nano'
    ]
  },
  {
    name: 'Qwen Image Edit Plus',
    description: 'Advanced image editing with instruction following (Dec 2025)',
    category: 'tool',
    icon: '✂️',
    content: `## Qwen Image Edit Plus Guide (Dec 2025)

### The Qwen Edit Formula
[Modification Instruction] + [Change Target] + [Style Preservation]

### Instruction Types

**Add Elements:**
- "Add a teddy bear next to the character"
- "Insert clouds in the upper sky area"
- "Place flowers along the garden path"

**Remove Elements:**
- "Remove the person in the background"
- "Eliminate the power lines from the sky"
- "Delete the watermark from the corner"

**Modify Attributes:**
- "Change the car color to matte black"
- "Convert to oil painting style"
- "Transform the outfit to modern casual"

**Novel View Synthesis:**
- Qwen can rotate objects by 90° or even 180°
- "Show the back side of the product"
- "Rotate the character to face right"

### Multi-Image Editing (2509 Version)
References image 1, image 2, image 3 directly:
- "Combine the face from image 1 with the body from image 2"
- "Apply the style of image 3 to the composition"

### Prompt Best Practices

**Be Specific About Targets:**
- ✅ "The woman with red hair"
- ✅ "The car in the foreground"
- ❌ Avoid pronouns: "it", "this thing"

**Preserve Unchanged Elements:**
- "...keeping all other elements unchanged"
- "...while preserving the overall style"
- "...matching textures of surrounding area"

### Technical Parameters
- Inference steps: 20-30 for quick, 50 for final renders
- Guidance/cfg_scale: 4-5 is ideal (lower = creative, higher = strict)

### Chained Editing
For complex results, use step-by-step approach:
1. First edit: Major change
2. Second edit: Refinement
3. Third edit: Final polish`,
    tags: ['qwen', 'alibaba', 'image-editing', 'remove', 'modify', 'style-transfer'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'qwen-edit',
    recommendedModels: ['qwen-image-edit-plus'],
    examples: [
      'Remove the person in the background @qwen-edit',
      'Change the car color to matte black @qwen-edit'
    ]
  },
  {
    name: 'P-Image Edit (Budget)',
    description: 'Fast, budget-friendly image editing at $0.01/generation (Dec 2025)',
    category: 'tool',
    icon: '💰',
    content: `## P-Image Edit Quick Guide (Dec 2025)

### Overview
High-precision image editing in under 1 second for $0.01/generation.
Best for: Quick iterations, batch processing, budget-conscious workflows.

### Prompt Structure
[Action verb] + [Specific target] + [Desired result] + [Preservation clause]

### Example Prompts

**Color Changes:**
"Change the red Ferrari to matte black with gold racing stripes"

**Adding Elements:**
"Add racing number '23' and sponsorship decals to the car's doors and hood"

**Environment Swap:**
"Place the red Ferrari on a sun-drenched coastal highway instead of the city"

**Style Matching:**
"Add a teddy bear next to the character, matching textures while preserving style and keeping all other elements unchanged"

### Key Capabilities
- Precise, styled text rendering without misspelling
- Multi-image support (1-5 images)
- Fast batch processing for production workflows
- Clean boundaries and reliable prompt alignment

### Best Practices
- Be explicit about what to keep unchanged
- Use specific object descriptions (not pronouns)
- One major change per prompt for best results
- Chain multiple edits for complex transformations

### When to Use P-Edit vs Qwen Edit
- P-Edit: Speed and budget priority, batch processing
- Qwen Edit: Complex transformations, novel view synthesis`,
    tags: ['p-image', 'pruna', 'budget', 'fast', 'batch-editing', 'production'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'p-edit',
    recommendedModels: ['p-image-edit'],
    examples: [
      'Quick color change to product @p-edit',
      'Batch edit product backgrounds @p-edit'
    ]
  },

  // ============================================
  // VIDEO MODEL SKILLS
  // ============================================
  {
    name: 'Veo 3.1 Cinematic Video',
    description: 'Complete video + audio generation guide for Google Veo 3.1 (Dec 2025)',
    category: 'technique',
    icon: '🎬',
    content: `## Veo 3.1 Complete Video Guide (Dec 2025)

### The Veo Formula
[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]

### Camera Movements
- **Dolly**: Camera moves toward/away from subject
- **Tracking**: Camera follows subject movement
- **Crane/Jib**: Vertical camera movement from height
- **Pan**: Horizontal rotation from fixed point
- **Tilt**: Vertical rotation from fixed point
- **POV**: First-person perspective
- **Handheld**: Natural, documentary-style
- **Static**: Fixed camera position
- **Vertigo/Dolly Zoom**: Zoom in while moving back

### Lens & Framing
- 24mm: Wide establishing shots
- 35mm: Cinematic standard
- 50mm: Natural perspective
- 85mm: Portrait-friendly
- "Shallow depth of field" for background blur
- "Deep focus" for everything sharp

### Lighting Keywords
- Golden hour / Blue hour
- Low-key (dramatic shadows)
- High-key (bright, minimal shadows)
- Rembrandt lighting (portrait triangle)
- Backlit / Silhouette
- Neon lighting / Practical lights

### AUDIO GENERATION (Key Feature)

**Dialogue:**
- Put spoken lines in quotes: 'Character says: "Hello there"'
- Keep lines short (4-10 words, ~8 seconds max)
- Add tone: "softly," "urgent whisper," "cheerful"
- Always add "(no subtitles)" to prevent text overlays

**Sound Effects:**
- Prefix with SFX: "SFX: ceramic cup clinks as it lands"
- Tie to specific on-screen actions
- One SFX per beat

**Ambience:**
- Summarize soundscape: "soft HVAC hum, distant traffic, light rain"
- Use "in the distance" for background sounds
- Explicitly state audio to avoid hallucinated audience laughter

**Music:**
- Specify mood: "minimal piano underscore, somber"
- Texture over tempo: "upbeat indie guitar, light"

### Example Prompt
"Sweeping drone shot of a lone astronaut planting a flag on a dusty asteroid, rings of a gas giant in sky, 70mm sci-fi epic with chiaroscuro lighting. SFX: boots crunching on gravel, distant radio static. (no subtitles)"

### Technical Specs
- Resolution: 720p or 1080p
- Frame rate: 24fps
- Aspect ratio: 16:9 or 9:16
- Plan 4-8 second shots rather than long takes

### Pricing
- Audio ON: 50¢/second
- Audio OFF: 25¢/second`,
    tags: ['veo', 'google', 'video', 'audio', 'cinematic', 'dialogue', 'sound-design'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'veo',
    recommendedModels: ['veo-3.1', 'veo-3.1-fast'],
    examples: [
      'Sweeping drone shot with SFX: wind rushing @veo',
      'Character dialogue scene, no subtitles @veo'
    ]
  },
  {
    name: 'Wan 2.5 Video Generation',
    description: 'Alibaba T2V/I2V video guide with resolution pricing (Dec 2025)',
    category: 'technique',
    icon: '🌊',
    content: `## Wan 2.5 T2V/I2V Video Guide (Dec 2025)

### Overview
Alibaba's Wan 2.5 generates videos up to 10 minutes with synchronized audio.
Available modes: Text-to-Video (T2V), Image-to-Video (I2V)

### Prompt Enhancement (Recommended)
Enable prompt extension to enrich details and enhance video quality.

### T2V Prompting

**Basic Structure:**
[Scene description] + [Action] + [Atmosphere] + [Technical specs]

**Example:**
"Two anthropomorphic cats in comfy boxing gear and bright gloves fight intensely on a spotlighted stage"

### I2V Prompting

**Structure:**
[Scene setting] + [Subject description] + [Action/expression] + [Background details]

**Example:**
"Summer beach vacation style, a white cat wearing sunglasses sits on a surfboard. The fluffy-furred feline gazes directly at the camera with a relaxed expression. Blurred beach scenery forms the background featuring crystal-clear waters, distant green hills, and a blue sky dotted with white clouds."

### Key Features

**Aspect Ratios:**
- 16:9 (landscape)
- 9:16 (vertical/social)
- 1:1 (square)
- 4:3, 3:4

**Resolution Pricing:**
- 480p: 8¢/second (budget)
- 720p: 13¢/second (standard)
- 1080p: 20¢/second (premium)

**Inspiration Mode:**
Enriches visuals and improves expressiveness. Results may diverge slightly from input for artistic touch.

**Last Frame Conditioning:**
Specify the final frame to guide how the clip ends—great for transitions and chaining clips.

### Best Practices
- Bilingual support (English and Chinese)
- Can render accurate in-frame text
- Use prompt extension for better quality
- Plan multi-shot sequences with last frame control`,
    tags: ['wan', 'alibaba', 't2v', 'i2v', 'video', 'multi-resolution', 'audio'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'wan',
    recommendedModels: ['wan-2.5-t2v', 'wan-2.5-i2v'],
    examples: [
      'Text-to-video with prompt extension @wan',
      'Image-to-video from start frame @wan'
    ]
  },
  {
    name: 'Kling V2.5 Turbo Pro',
    description: 'Kuaishou video with micro-expression mastery (Dec 2025)',
    category: 'technique',
    icon: '🎯',
    content: `## Kling V2.5 Turbo Pro Video Guide (Dec 2025)

### The Kling Formula
Subject (with details) + Subject's action + Scene (with details) + [Camera/lighting/atmosphere]

### Key Strengths

**Micro-Expression Mastery:**
- Subtle, human-like acting
- Nervous ticks and heartfelt glances
- Cinematic emotional realism

**Prompt Adherence:**
- Faithfully follows multi-step instructions
- Minimal off-prompt artifacts and drift
- Stable style, subject, and camera cues

**Infinite Length Videos:**
- Stretch clips indefinitely
- Seamless scene extensions
- Great for long-form content

### Movement & Action Keywords
- "Glides smoothly" / "Jerks to a halt"
- "Weaves between" / "Rushes through"
- Be specific: "The bike weaves between blooming tulips at dawn"

### Camera Direction
- Close-up: "Tight shot on smiling eyes"
- Tracking: "Camera follows subject at walking pace"
- Drone-style: "Aerial follow shot descending"

### Lighting & Mood
- "Bathed in sunset gold" / "Harsh midday glare"
- "Serene and hopeful" / "Eerie and tense"
- Lighting sets emotional tone—specify it!

### Scene Description
- Layer sensory details: "Misty forest trail lined with ancient oaks"
- Imply motion: "Leaves rustling in gentle wind"
- Be specific, not generic

### Technical Specs
- 1080p at 48FPS
- 25% faster than previous versions
- 30% more cost-efficient
- 15¢/second

### Troubleshooting
- **Character drift**: Use fixed seed values, more detailed descriptions
- **Lighting issues**: Specify "consistent lighting," avoid dramatic changes
- **For consistency**: Use image-to-video mode with reference`,
    tags: ['kling', 'kuaishou', 'video', 'turbo', 'fast', 'expressions', 'infinite-length'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'kling',
    recommendedModels: ['kling-v2.5-turbo-pro'],
    examples: [
      'Character with subtle emotional expressions @kling',
      'Tracking shot following subject @kling'
    ]
  },

  // ============================================
  // STYLE & TECHNIQUE SKILLS
  // ============================================
  {
    name: 'Product Photography Pro',
    description: 'Professional e-commerce and commercial product techniques (Dec 2025)',
    category: 'style',
    icon: '📦',
    content: `## AI Product Photography Guide (Dec 2025)

### The Product Formula
[Product description] + [Background/setting] + [Lighting setup] + [Camera specs] + [Style]

### Basic Prompting

**Keep It Concise (40-60 words max):**
- ✅ "Modern coffee table, curved edges, wooden legs, polished glass top"
- ❌ Long descriptions get ignored or cut off

**Use Descriptive Adjectives:**
- "Luxurious, smooth, glossy brown leather handbag with gold accents"
- Convey texture, material, color, and ambiance

### Technical Specifications

**Lighting:**
- "Professional studio lighting, soft diffused light"
- "Three-point lighting setup"
- "Dramatic shadows for depth"
- "Clean, even lighting for catalog shots"

**Camera Settings:**
- "Shot on Canon EOS R5, 85mm lens, f/8"
- "Macro lens for detail shots"
- "Product isolation, white infinity background"

**Composition:**
- 3/4 view for most products
- Flat lay for accessories/cosmetics
- Lifestyle context for emotional connection

### Example Prompts

**Catalog Shot:**
"Wireless earbuds floating on white background, soft shadow underneath, professional studio lighting, product photography, shot on 100mm macro lens, 8K detail"

**Lifestyle Context:**
"Skincare bottle on marble bathroom counter, morning light through window, minimalist aesthetic, shallow depth of field, luxury brand photography"

**Hero Shot:**
"Luxury watch floating in mid-air, dramatic studio lighting with reflections, black gradient background, commercial photography, ultra-sharp detail"

### Batch Consistency
- Save and reuse successful prompts as templates
- Keep lighting consistent across product lines
- Create category-specific templates for brand style`,
    tags: ['product', 'ecommerce', 'commercial', 'professional', 'catalog', 'lifestyle'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'product',
    recommendedModels: ['seedream-4.5', 'flux-2-pro', 'nano-banana-pro'],
    examples: [
      'Wireless earbuds floating on white background @product',
      'Luxury watch hero shot with dramatic lighting @product'
    ]
  },
  {
    name: 'Portrait & Headshot Pro',
    description: 'Professional portrait lighting patterns and techniques (Dec 2025)',
    category: 'technique',
    icon: '👤',
    content: `## AI Portrait Photography Guide (Dec 2025)

### The Portrait Formula
[Subject description] + [Lighting pattern] + [Camera/lens] + [Background] + [Mood/style]

### Classic Lighting Patterns

**Rembrandt Lighting:**
- Key light ~45° off-axis, above eye level
- Small triangle of light on shadow cheek
- "Rembrandt lighting, dramatic shadows, sculpted drama"

**Butterfly (Paramount):**
- Key centered, slightly above
- Butterfly shadow under nose
- Best for: beauty, glamour shots

**Loop Lighting:**
- Key 30-45° to side, above eye level
- Small nose shadow loop
- Most versatile, universally flattering

**Split Lighting:**
- Key at 90° to side
- Half face in shadow
- Highly dramatic

**Rim Lighting:**
- Light behind/side outlining subject
- Adds separation from background
- "Rim light creating halo effect"

### Technical Setup

**Camera & Lens:**
- "Shot on 85mm f/1.4, shallow depth of field"
- "50mm lens for natural perspective"
- "135mm for compressed, flattering features"

**Background:**
- "Background separation with bokeh"
- "Clean studio backdrop, neutral tones"
- "Environmental portrait, contextual setting"

### Subject Guidelines
- Ensure catch lights in eyes
- Soft skin texture (avoid over-smoothing)
- Specify ethnicity and age for diversity
- Include mood: professional, casual, dramatic

### Example Prompts

**Corporate Headshot:**
"Professional headshot of a business executive, loop lighting, shot on 85mm f/2.8, neutral gray background, confident expression, sharp focus on eyes, corporate photography"

**Dramatic Portrait:**
"Dramatic portrait with Rembrandt lighting, triangle of light on cheek, moody atmosphere, shallow depth of field, fine art photography, rich textures"

**Beauty Shot:**
"Beauty portrait, butterfly lighting, soft diffused light, flawless skin texture, catch lights in eyes, 100mm macro lens, high-end cosmetics advertising"`,
    tags: ['portrait', 'headshot', 'lighting', 'rembrandt', 'professional', 'beauty'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'portrait',
    recommendedModels: ['flux-2-pro', 'seedream-4.5'],
    examples: [
      'Corporate headshot with loop lighting @portrait',
      'Dramatic Rembrandt lighting portrait @portrait'
    ]
  },
  {
    name: 'Social Media Optimizer',
    description: 'Platform-specific formats and trending styles (Dec 2025)',
    category: 'workflow',
    icon: '📱',
    content: `## Social Media Image Optimization Guide (Dec 2025)

### Platform Specs

**Instagram:**
- Feed posts: 1080×1080 (1:1) or 1080×1350 (4:5)
- Stories/Reels: 1080×1920 (9:16)
- Best: Vibrant colors, high saturation, clear focal point

**TikTok:**
- Standard: 1080×1920 (9:16)
- Bold visual hooks in first frame
- High contrast performs well

**Twitter/X:**
- Standard: 1600×900 (16:9)
- Clear focal point, works at small sizes

**LinkedIn:**
- Standard: 1200×627 (1.91:1)
- Professional, value-led imagery

### Trending Styles (2025)

**Y2K Chrome Aesthetic:**
- Nostalgic, early-internet look
- Metallic, reflective surfaces
- Bold, retro-futuristic colors

**Pop Surrealism:**
- Dreamy, offbeat visuals
- Strange, colorful, and fun
- High engagement on Instagram/Pinterest

**Abstract Cinematic:**
- Moody, artistic compositions
- Pairs well with music in reels
- Great for story visuals

### Optimization Tips

**Vertical First:**
- 4:5 and 9:16 dominate mobile
- Higher watch time, more saves/shares
- Always test vertical for social

**Resolution:**
- Export at 2× (2160×2700 for 4:5 Instagram)
- Use PNG for images with text
- Test thumbnail variants for CTR

**Hooks:**
- Bold visual in first frame
- High contrast grabs attention
- Clear subject, minimal clutter

### Example Prompts

**Instagram Product:**
"Vibrant flat lay of coffee beans and accessories, 4:5 aspect ratio, bright morning light, saturated colors, clean composition, Instagram-optimized, lifestyle brand aesthetic"

**TikTok Thumbnail:**
"Eye-catching portrait with surprised expression, 9:16 vertical, bold neon lighting, high contrast, social media optimized, scroll-stopping visual"`,
    tags: ['social', 'instagram', 'tiktok', 'vertical', 'engagement', 'viral'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'social',
    examples: [
      'Instagram-optimized 4:5 product shot @social',
      'TikTok thumbnail with bold hook @social 9:16'
    ]
  },
  {
    name: 'Typography & Text',
    description: 'Best practices for text rendering in AI images (Dec 2025)',
    category: 'technique',
    icon: '✍️',
    content: `## AI Text Rendering Guide (Dec 2025)

### Best Models for Text
1. **Ideogram 3.0** - 90% accuracy, best for posters/logos
2. **FLUX Kontext** - Great for in-context editing, fixing text
3. **FLUX 2 Pro** - Good for integrated text in scenes
4. **Seedream 4.5** - Decent text, use quotation marks

### Core Principles

**Keep Text Simple:**
- Short, everyday words > complex terminology
- 3-5 words for best results
- Longer sentences = more errors

**Specify Font Style:**
- "Bold sans-serif lettering"
- "Elegant script font"
- "Hand-written style"
- "Vintage serif typography"

**Placement & Contrast:**
- Position text in areas with visual space
- High contrast between text and background
- Add text glow or shadow for readability

### Prompting Techniques

**Use Quotation Marks:**
- ✅ 'Logo saying "BREW" in bold letters'
- ❌ Logo with the word BREW

**Specify Style:**
- "Neon sign text glowing 'OPEN'"
- "Vintage marquee letters spelling 'CINEMA'"
- "Chalk-style text on blackboard"

### Example Prompts

**Logo:**
"Modern minimalist logo design, text 'NEXUS' in bold geometric sans-serif, black on white, clean professional branding, vector-style"

**Poster:**
"Movie poster with title 'MIDNIGHT' in dramatic serif font, neon purple glow effect, dark cinematic background, Hollywood blockbuster style"

**Signage:**
"Vintage coffee shop window sign reading 'FRESH COFFEE' in hand-painted gold letters, weathered glass texture, warm ambient lighting"

### Troubleshooting
- Regenerate if text is wrong (common issue)
- Try shorter word alternatives
- Use post-production tools for complex typography`,
    tags: ['text', 'typography', 'logos', 'signage', 'posters', 'lettering'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'text',
    recommendedModels: ['flux-2-pro', 'seedream-4.5'],
    examples: [
      'Logo saying "BREW" in bold letters @text',
      'Neon sign text glowing "OPEN" @text'
    ]
  },
  {
    name: 'Cinematic Style Pro',
    description: 'Movie-like compositions, lighting, and color grading (Dec 2025)',
    category: 'style',
    icon: '🎥',
    content: `## Cinematic Image Style Guide (Dec 2025)

### The Cinematic Formula
[Shot type] + [Subject] + [Action/Pose] + [Environment] + [Lighting] + [Color/Grade] + [Film reference]

### Shot Types
- **Extreme Wide**: Establishes scale, epic landscapes
- **Wide**: Full environment context
- **Medium**: Waist-up, balanced composition
- **Close-up**: Face/detail focus, emotional
- **Extreme Close-up**: Eyes, hands, dramatic detail

### Camera Angles
- **Eye Level**: Neutral, relatable
- **Low Angle**: Power, dominance, heroic
- **High Angle**: Vulnerability, overview
- **Dutch Angle**: Tension, unease, disorientation
- **Bird's Eye**: Omniscient, artistic

### Lighting Styles

**Chiaroscuro:**
- Strong contrast, dramatic shadows
- "Chiaroscuro lighting, deep blacks, selective illumination"

**Noir:**
- Hard shadows, venetian blind patterns
- "Film noir lighting, dramatic shadows, 1940s detective aesthetic"

**Golden Hour:**
- Warm, romantic, epic
- "Golden hour backlighting, warm amber tones, lens flare"

**Neon/Cyberpunk:**
- Saturated colors, urban night
- "Neon lighting reflecting on wet streets, cyberpunk atmosphere"

### Color Grading
- **Teal & Orange**: Hollywood blockbuster standard
- **Desaturated**: Gritty, realistic, war films
- **High Contrast B&W**: Dramatic noir
- **Vintage Film**: Warm highlights, faded blacks
- **Cool Blue**: Suspense, isolation, technology

### Film References
- "In the style of Blade Runner"
- "Roger Deakins cinematography"
- "Wes Anderson symmetry"
- "Christopher Nolan IMAX format"

### Example Prompts

**Sci-Fi Epic:**
"Wide establishing shot of a lone astronaut on alien planet, two moons in sky, blue hour lighting, fog rolling across barren landscape, 70mm anamorphic lens, Denis Villeneuve cinematography style"

**Noir Detective:**
"Medium shot of detective in fedora, venetian blind shadows across face, cigarette smoke curling, 1940s office, film noir black and white, high contrast, grainy film texture"

**Action Sequence:**
"Low angle hero shot, character walking toward camera in slow motion, explosion behind, orange firelight, teal shadows, Michael Bay blockbuster style, anamorphic lens flare"`,
    tags: ['cinematic', 'dramatic', 'movie', 'film', 'composition', 'lighting', 'color-grading'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'cinematic',
    recommendedModels: ['seedream-4.5', 'flux-2-pro'],
    examples: [
      'Noir detective with venetian blind shadows @cinematic',
      'Sci-fi epic in Blade Runner style @cinematic'
    ]
  },
  {
    name: 'Style & Character Consistency',
    description: 'Multi-image reference and template techniques (Dec 2025)',
    category: 'workflow',
    icon: '🔄',
    content: `## Style & Character Consistency Guide (Dec 2025)

### The Three Pillars of Consistency
1. **Variables**: Seed, composition, lens, aspect ratio
2. **References**: Style, character, structure images
3. **Templates**: Reusable prompt structures

### Multi-Image Reference Techniques

**FLUX 2 (Up to 8 images):**
- Reference by number: "Use pose from image 1, style from image 2"
- Natural language: "Combine the woman's face with the outfit from reference"
- Keep text prompts minimal—let images carry visual info

**Seedream 4.5 (Up to 14 images):**
- Best for sequential generation
- Maintains character ID across variations
- Supports drastic style transfers with identity preservation

**Nano Banana Pro (Up to 14 images):**
- Blend up to 14 images
- Maintain consistency of up to 5 people
- Use conversational editing for refinement

### Template Approach

**Character Template:**
"[Character name], [key visual features: hair color, eye color, distinctive marks], [outfit description], [pose/action], [setting], [lighting], [style], seed:[number]"

**Brand Style Template:**
"[Product type], [brand color palette], [consistent lighting setup], [background style], [camera angle], [photography style]"

### Five-Component Prompts (91% Success Rate)
1. Source acknowledgment: "Transform this photo"
2. Transformation type: "into oil painting style"
3. Preserved elements: "maintaining facial features"
4. Quality modifiers: "high detail, professional quality"
5. Negative constraints: "avoid abstract, no text"

### Example Workflow

**Character Sheet:**
1. Generate base character with detailed description + seed
2. Save prompt as template
3. Modify only pose/expression for variations
4. Keep seed, lighting, and style identical

**Brand Campaign:**
1. Establish visual elements: colors, lighting, composition
2. Create master prompt template
3. Swap only product/subject for each variation
4. Maintain identical technical specs`,
    tags: ['consistency', 'reference', 'character', 'style-transfer', 'template', 'multi-image'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'consistency',
    recommendedModels: ['seedream-4.5', 'flux-2-pro'],
    examples: [
      'Character variations with identity preservation @consistency',
      'Brand campaign with consistent style @consistency'
    ]
  },
  {
    name: 'Cinematography Reference',
    description: 'Complete camera movement & shot type glossary (Dec 2025)',
    category: 'tool',
    icon: '📽️',
    content: `## Complete Camera Movement & Shot Reference (Dec 2025)

### Camera Movements

**Horizontal Movements:**
- **Pan Left/Right**: Rotate camera horizontally on fixed point
- **Truck Left/Right**: Move camera horizontally, parallel to subject
- **Arc**: Camera moves in curved path around subject

**Vertical Movements:**
- **Tilt Up/Down**: Rotate camera vertically on fixed point
- **Pedestal Up/Down**: Move camera vertically, maintaining orientation
- **Crane/Jib**: Dramatic vertical movement from height

**Depth Movements:**
- **Dolly In/Out (Push/Pull)**: Move camera toward/away from subject
- **Zoom In/Out**: Change focal length (not physical movement)
- **Dolly Zoom (Vertigo)**: Zoom while moving opposite direction

**Dynamic Movements:**
- **Tracking Shot**: Follow moving subject
- **Steadicam**: Smooth following shot
- **Handheld**: Natural, documentary feel
- **Drone/Aerial**: High vantage point, sweeping

### Shot Types

**By Distance:**
- Extreme Wide Shot (EWS): Tiny subject in vast environment
- Wide Shot (WS): Full body + environment
- Medium Wide (MWS): Knees up
- Medium Shot (MS): Waist up
- Medium Close-up (MCU): Chest up
- Close-up (CU): Face fills frame
- Extreme Close-up (ECU): Eyes, hands, detail

**By Angle:**
- Eye Level: Neutral, relatable
- Low Angle: Power, heroic
- High Angle: Vulnerable, small
- Bird's Eye: Directly above
- Worm's Eye: Directly below
- Dutch Angle: Tilted horizon, unease

**Special Shots:**
- Over-the-Shoulder (OTS): Conversation framing
- POV: First-person perspective
- Two-Shot: Two subjects in frame
- Insert: Detail cutaway
- Establishing: Sets location/context

### Lens Language

**Focal Lengths:**
- 14-24mm: Ultra-wide, dramatic distortion
- 24-35mm: Wide, environmental
- 35-50mm: Standard, natural
- 50-85mm: Portrait, flattering
- 85-135mm: Telephoto, compressed
- 200mm+: Extreme telephoto, isolation

**Aperture Effects:**
- f/1.4-2.8: Shallow DOF, bokeh
- f/4-5.6: Moderate depth
- f/8-11: Deep focus, sharp throughout
- f/16+: Maximum depth, potential diffraction

### Quick Reference Combos

**Dramatic Reveal:**
"Slow push-in, starting wide, ending on close-up, revealing..."

**Action Following:**
"Steadicam tracking shot, following subject at running pace..."

**Epic Scale:**
"Crane shot rising from ground level to bird's eye view..."

**Intimate Moment:**
"Static medium close-up, 85mm shallow DOF, eye-level..."`,
    tags: ['camera', 'cinematography', 'shots', 'movements', 'reference', 'terminology'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'camera',
    examples: [
      'Dolly zoom dramatic reveal @camera',
      'Steadicam tracking at running pace @camera'
    ]
  },

  // ============================================
  // ADDITIONAL CREATIVE SKILLS
  // ============================================
  {
    name: 'Photorealistic Skin Texture',
    description: 'Escape AI beauty filter mode with realistic skin (Dec 2025)',
    category: 'technique',
    icon: '🧬',
    content: `## Photorealistic Skin Texture Guide (Dec 2025)

### The Problem
AI defaults to "beauty filter" mode—smoothing away the very imperfections that make skin real.

### Key Texture Keywords

**Add These to Your Prompts:**
- "Visible skin pores"
- "Fine microtexture"
- "Natural imperfections"
- "Subtle freckles"
- "Faint smile lines"
- "Realistic sheen on highlights"
- "Subsurface scattering"
- "Vellus hairs" (peach fuzz)
- "Specular variation" (oily/dry patches)
- "High detail skin texture, 8K"

### Negative Prompts (SDXL/Flux)
Add to negatives or de-emphasize:
- "plastic skin"
- "waxy skin"
- "over-smoothed"
- "cartoonish"
- "harsh color cast"
- "airbrushed"

### Camera & Lighting for Realism

**Use Photography Terminology:**
- "Shot on 50mm lens, f/1.8"
- "Natural window lighting"
- "Soft shadows, ambient light"
- "Side light" / "Backlight"
- "Studio light but soft shadows"

Avoid flat, generic lighting—it triggers AI's "beauty mode"

### Balance Is Critical
Too much detail (over-sharpening) also looks artificial:
- Slight grain helps
- Subtle imperfections, not exaggerated
- Slight asymmetry adds authenticity
- Avoid turning skin into sculpture/wax

### Example Prompts

**Realistic Portrait:**
"Close-up portrait of 30-year-old woman, visible skin pores, subtle freckles, natural imperfections, fine microtexture, 50mm lens f/2.8, soft window lighting, realistic sheen on highlights, 8K detail"

**Editorial Beauty:**
"Fashion editorial close-up, photorealistic skin texture, visible pores and fine lines, natural beauty, Peter Lindbergh inspired, minimal retouching aesthetic, soft shadows"

**Character Study:**
"Detailed character portrait, weathered skin with sun spots and laugh lines, authentic imperfections, subsurface scattering, golden hour side lighting, cinematic"`,
    tags: ['skin', 'realism', 'pores', 'texture', 'imperfections', 'photorealistic', 'beauty'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'skin-realism',
    recommendedModels: ['flux-2-pro', 'seedream-4.5', 'nano-banana-pro'],
    examples: [
      'Portrait with visible skin pores and natural imperfections @skin-realism',
      'Editorial beauty with authentic skin texture @skin-realism'
    ]
  },
  {
    name: 'Creative Vision Styles',
    description: 'Photographer-inspired aesthetics: Leibovitz, Lindbergh, Walker (Dec 2025)',
    category: 'style',
    icon: '📷',
    content: `## Creative Director Visual Styles (Dec 2025)

### Inspired by Masters—Not Generic AI Slop

Apply these photographer-inspired aesthetics as "context profiles" on top of any prompt:

---

## Annie Leibovitz Style
**Keywords:** painterly, dramatic lighting, cinematic narrative, theatrical staging

**Characteristics:**
- Bold compositions with storytelling
- Wide landscapes over simple studios
- Muted tones, deep blacks, earthy greens
- Dramatic contrast and theatrical elements
- Subjects posed in dynamic, expressive ways
- Ethereal, dreamlike quality

**Prompt Addition:**
"Annie Leibovitz inspired, painterly aesthetic, dramatic cinematic lighting, theatrical staging, narrative portrait, muted tones with deep blacks, expressive pose, environmental storytelling"

---

## Peter Lindbergh Style
**Keywords:** black and white, raw authenticity, natural beauty, minimal retouching

**Characteristics:**
- Predominantly black & white
- Natural, unretouched beauty
- Visible pores, fine lines, freckles included
- Simple, unfussy backgrounds
- Authentic emotion over perfection
- Anti-airbrushing philosophy

**Prompt Addition:**
"Peter Lindbergh inspired, black and white, raw and authentic, natural beauty without retouching, visible skin texture and imperfections, simple background, honest portraiture"

---

## Tim Walker Style
**Keywords:** fantastical, whimsical, elaborate sets, dreamlike surrealism

**Characteristics:**
- Fantastical elaborate sets with real props
- Alice in Wonderland aesthetic
- Unexpected angles and compositions
- Bold, vibrant colors
- Rule-breaking creativity
- Theatrical props and costumes

**Prompt Addition:**
"Tim Walker inspired, fantastical whimsical scene, elaborate theatrical set, dreamlike surrealism, vibrant saturated colors, unexpected angles, Alice in Wonderland aesthetic"

---

## Steven Meisel Style
**Keywords:** editorial edge, bold fashion, provocative compositions

**Prompt Addition:**
"Steven Meisel inspired, bold editorial fashion, provocative yet elegant, high contrast, dramatic poses, Italian Vogue aesthetic"

---

## Helmut Newton Style
**Keywords:** bold noir, provocative elegance, architectural lighting

**Prompt Addition:**
"Helmut Newton inspired, bold black and white, provocative elegance, strong architectural lighting, powerful feminine energy, cinematic noir fashion"

---

## Usage Examples

**Combining with Subject:**
"Portrait of a woman in flowing white gown, Annie Leibovitz inspired, painterly aesthetic, dramatic cinematic lighting, theatrical forest setting, muted tones"

**Fashion Editorial:**
"Editorial fashion shot, model in avant-garde couture, Tim Walker inspired, fantastical set with oversized flowers, dreamlike atmosphere, vibrant colors"

**Raw Beauty:**
"Close-up beauty portrait, Peter Lindbergh inspired, black and white, natural skin texture with visible pores, authentic expression, soft diffused light"`,
    tags: ['photographer', 'creative-director', 'leibovitz', 'lindbergh', 'walker', 'editorial', 'artistic'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'creative-vision',
    recommendedModels: ['seedream-4.5', 'flux-2-pro', 'nano-banana-pro'],
    examples: [
      'Portrait in Annie Leibovitz style, theatrical staging @creative-vision',
      'Peter Lindbergh inspired B&W with natural skin @creative-vision'
    ]
  },
  {
    name: 'Anti-Slop Styles',
    description: 'Non-generic visual alternatives to escape AI defaults (Dec 2025)',
    category: 'style',
    icon: '🎨',
    content: `## Anti-Slop: Non-Generic Visual Styles (Dec 2025)

### Escape AI's Default Aesthetic

AI models tend toward homogenized "AI look"—here are intentional style departures:

---

## Clean Line Art
**Counter to:** Over-rendered AI detail

"Simple clean line art, clear contours, minimal detail, hand-drawn quality, honest linework, no over-rendering, illustration style"

---

## Retro-Futurism
**Counter to:** Generic sci-fi

"Retro-futuristic aesthetic, 1960s space age optimism, chrome and pastels, Jetsons meets 2001, analog future, vintage tomorrow"

---

## Wabi-Sabi Imperfection
**Counter to:** AI perfection bias

"Wabi-sabi aesthetic, beautiful imperfection, asymmetry embraced, patina and wear, handmade quality, impermanent beauty, authentic flaws"

---

## Brutalist Minimal
**Counter to:** Busy AI compositions

"Brutalist minimalism, raw concrete aesthetic, stark geometric forms, deliberate emptiness, monolithic presence, anti-decoration"

---

## Analog Warmth
**Counter to:** Digital coldness

"Analog warmth, film grain texture, slight color shifts, imperfect focus, nostalgic quality, 35mm aesthetic, before digital perfection"

---

## Neo-Maximalism
**Counter to:** Safe, predictable compositions

"Neo-maximalist aesthetic, bold pattern clashes, color overload, intentional excess, more-is-more philosophy, fearless decoration"

---

## Documentary Raw
**Counter to:** Over-stylized AI images

"Documentary photography style, candid unposed moment, available light only, slightly imperfect framing, authentic reality, no staging"

---

## Pop Surrealism
**Counter to:** Generic fantasy

"Pop surrealism, lowbrow art aesthetic, dreamy and offbeat, strange juxtapositions, vibrant and unsettling, contemporary weird"

---

## Y2K Chrome Revival
**Counter to:** Dated AI aesthetics

"Y2K chrome aesthetic, metallic reflections, early internet nostalgia, cyber silver, iMac era optimism, glossy surfaces"

---

### Combining Anti-Slop Styles

You can layer these with technical prompts:

"Product shot of headphones, wabi-sabi aesthetic, intentional imperfection, analog warmth with film grain, slightly asymmetric composition"

"Portrait in pop surrealism style, dreamlike oddity, unexpected elements, vibrant but strange, Tim Walker meets Mark Ryden"`,
    tags: ['anti-slop', 'non-generic', 'alternative', 'artistic', 'counter-aesthetic'],
    isBuiltIn: true,
    isActive: true,
    shortcut: 'anti-slop',
    examples: [
      'Product shot with wabi-sabi imperfection @anti-slop',
      'Portrait in pop surrealism style @anti-slop'
    ]
  },

  // ============================================
  // KEEP EXISTING STORYBOARD SKILL
  // ============================================
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
    recommendedModels: ['seedream-4.5'],
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
    description: 'Build perfect prompts for Midjourney, DALL-E, Stable Diffusion & more. Save prompts to your library.',
    category: 'chat',
    tags: ['prompt-building', 'brainstorm', 'free'],
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
  {
    id: 'session-mode',
    name: 'Session Mode',
    provider: 'Skinny Studio',
    description: 'Guided creative missions: Product Drop, Album Drop, Brand Sprint, Content Week',
    category: 'chat',
    tags: ['session', 'workflow', 'guided', 'assets'],
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

// -------------------- Sessions (Guided Creative Missions) --------------------

export type SessionType = 'product-drop' | 'album-drop' | 'brand-sprint' | 'content-week'

export interface SessionAssetTemplate {
  id: string
  name: string
  description: string
  aspectRatio: string
  modelSuggestion: string
  skills: string[]
  required: boolean
}

export interface SessionTemplate {
  id: string
  name: string
  description: string
  icon: string
  type: SessionType
  assets: SessionAssetTemplate[]
  defaultSkills: string[]
}

export interface SessionAsset {
  id: string
  templateAssetId: string
  name: string
  status: 'pending' | 'generating' | 'completed' | 'skipped'
  generationId?: string
  outputUrl?: string
  sortOrder: number
}

export interface Session {
  id: string
  templateId: string
  title: string
  status: 'planning' | 'in_progress' | 'completed'
  assets: SessionAsset[]
  briefContext?: {
    vibe?: string
    platform?: string
    style?: string
    outputType?: string
  }
  createdAt: Date
  updatedAt: Date
}

// Session type display config - uses lucide icon names (not emojis)
export const sessionTypeConfig: Record<SessionType, { label: string; icon: string; color: string; description: string }> = {
  'product-drop': { label: 'Product Drop', icon: 'Package', color: 'text-amber-400', description: 'E-commerce hero shots, lifestyle, social' },
  'album-drop': { label: 'Album Drop', icon: 'Music', color: 'text-purple-400', description: 'Cover art, promo images, visualizers' },
  'brand-sprint': { label: 'Brand Sprint', icon: 'Target', color: 'text-blue-400', description: 'Logo mockups, brand identity, marketing' },
  'content-week': { label: 'Content Week', icon: 'Smartphone', color: 'text-green-400', description: 'Social posts, stories, thumbnails' },
}
