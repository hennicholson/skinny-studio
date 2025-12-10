// ============================================
// Replicate API Integration
// Using Gemini 3.0 Pro for LLM assistance
// ============================================

import Replicate from 'replicate'

// Initialize Replicate client (server-side only)
export function getReplicateClient() {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN is not set')
  }

  return new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  })
}

// -------------------- Prompt Enhancement --------------------

export interface EnhancePromptResult {
  enhancedPrompt: string
  suggestions: string[]
}

export async function enhancePrompt(
  rawPrompt: string,
  style?: string
): Promise<EnhancePromptResult> {
  const replicate = getReplicateClient()

  const systemPrompt = `You are a creative AI prompt engineer specializing in image generation prompts.

Your task is to enhance the user's prompt to be more detailed, vivid, and effective for AI image generation.

Guidelines:
- Add specific visual details (lighting, composition, atmosphere)
- Include relevant artistic style references when appropriate
- Maintain the original intent and core concept
- Keep the prompt concise but descriptive (under 200 words)
- Use comma-separated descriptors for better AI parsing

${style ? `The user wants a "${style}" style.` : ''}

Respond in this exact JSON format:
{
  "enhancedPrompt": "your enhanced prompt here",
  "suggestions": [
    "alternative direction 1",
    "alternative direction 2",
    "alternative direction 3"
  ]
}`

  const input = {
    prompt: `${systemPrompt}\n\nUser's original prompt: "${rawPrompt}"\n\nRespond with valid JSON only:`,
    thinking_level: 'low' as const,
  }

  let result = ''

  for await (const event of replicate.stream('google/gemini-3-pro', { input })) {
    result += event
  }

  // Parse JSON response
  try {
    // Clean up potential markdown code blocks
    const cleaned = result
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    return {
      enhancedPrompt: parsed.enhancedPrompt || rawPrompt,
      suggestions: parsed.suggestions || [],
    }
  } catch {
    // Fallback if JSON parsing fails
    return {
      enhancedPrompt: result.trim() || rawPrompt,
      suggestions: [],
    }
  }
}

// -------------------- Model Recommendation --------------------

export async function recommendModel(prompt: string): Promise<string> {
  const replicate = getReplicateClient()

  const systemPrompt = `You are an AI assistant that recommends the best image generation model based on a prompt.

Available models:
- flux-pro: Best for photorealistic images, high quality, good prompt following
- flux-schnell: Fast generation, good for iterations and drafts
- sdxl: Versatile, good for artistic styles, large community
- sdxl-lightning: Very fast, 4-step generation, good balance of speed/quality
- playground-v2.5: Aesthetic-focused, beautiful artistic outputs
- ideogram: Best for text in images, logos, typography
- recraft-v3: Professional design, vector-like quality

Based on the prompt, respond with ONLY the model ID (e.g., "flux-pro"). No explanation.`

  const input = {
    prompt: `${systemPrompt}\n\nPrompt: "${prompt}"`,
    thinking_level: 'low' as const,
  }

  let result = ''

  for await (const event of replicate.stream('google/gemini-3-pro', { input })) {
    result += event
  }

  const modelId = result.trim().toLowerCase()

  // Validate model ID
  const validModels = ['flux-pro', 'flux-schnell', 'sdxl', 'sdxl-lightning', 'playground-v2.5', 'ideogram', 'recraft-v3']

  if (validModels.includes(modelId)) {
    return modelId
  }

  return 'flux-pro' // Default fallback
}

// -------------------- Image Generation (Future) --------------------

export interface GenerateImageParams {
  prompt: string
  model: string
  width?: number
  height?: number
  negativePrompt?: string
}

export interface GenerateImageResult {
  imageUrl: string
  seed?: number
}

export async function generateImage(
  params: GenerateImageParams
): Promise<GenerateImageResult> {
  const replicate = getReplicateClient()

  // Model mapping to Replicate IDs
  const modelMap: Record<string, string> = {
    'flux-pro': 'black-forest-labs/flux-pro',
    'flux-schnell': 'black-forest-labs/flux-schnell',
    'sdxl': 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    'sdxl-lightning': 'bytedance/sdxl-lightning-4step:5f24084160c9089501c1b3545d9be3c27883ae2239b6f412990e82d4a6210f8f',
    'playground-v2.5': 'playgroundai/playground-v2.5-1024px-aesthetic:a45f82a1382bed5c7aeb861dac7c7d191b0fdf74d8d57c4a0e6ed7d4d0bf7d24',
    'ideogram': 'ideogram-ai/ideogram-v2:a]',
    'recraft-v3': 'recraft-ai/recraft-v3',
  }

  const replicateModel = modelMap[params.model] || modelMap['flux-pro']

  const input: Record<string, unknown> = {
    prompt: params.prompt,
  }

  if (params.width) input.width = params.width
  if (params.height) input.height = params.height
  if (params.negativePrompt) input.negative_prompt = params.negativePrompt

  const output = await replicate.run(replicateModel as `${string}/${string}` | `${string}/${string}:${string}`, { input })

  // Handle different output formats
  let imageUrl: string

  if (Array.isArray(output)) {
    imageUrl = output[0] as string
  } else if (typeof output === 'string') {
    imageUrl = output
  } else if (output && typeof output === 'object' && 'url' in output) {
    imageUrl = (output as { url: string }).url
  } else {
    throw new Error('Unexpected output format from Replicate')
  }

  return {
    imageUrl,
  }
}

// -------------------- Streaming Chat (for Planning) --------------------

export async function* streamChat(prompt: string): AsyncGenerator<string, void, unknown> {
  const replicate = getReplicateClient()

  const input = {
    prompt,
    thinking_level: 'low' as const,
  }

  for await (const event of replicate.stream('google/gemini-3-pro', { input })) {
    yield String(event)
  }
}
