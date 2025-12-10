import Replicate from 'replicate'
import { getModelSpec } from '@/lib/orchestrator/model-specs'

export const runtime = 'edge'
export const maxDuration = 300 // 5 minutes for generation

interface GenerateRequest {
  model: string
  prompt: string
  params?: Record<string, any>
  referenceImages?: string[] // Base64 or URLs
}

// Initialize Replicate with API key
function getReplicateClient() {
  const apiKey = process.env.REPLICATE_API_TOKEN
  if (!apiKey) {
    throw new Error('REPLICATE_API_TOKEN not configured')
  }
  return new Replicate({ auth: apiKey })
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as GenerateRequest
    const { model, prompt, params = {}, referenceImages } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const replicate = getReplicateClient()

    // Get model spec
    const modelSpec = getModelSpec(model)
    if (!modelSpec) {
      return new Response(JSON.stringify({ error: `Unknown model: ${model}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build input based on model
    const input: Record<string, any> = { prompt }

    // Model-specific input mapping
    switch (model) {
      case 'seedream-4.5':
        input.size = params.size || '2K'
        input.aspect_ratio = params.aspect_ratio || '1:1'
        if (referenceImages?.length) {
          input.image_input = referenceImages
        }
        break

      case 'flux-2-pro':
        input.aspect_ratio = params.aspect_ratio || '1:1'
        input.resolution = params.resolution || '1 MP'
        input.output_format = params.output_format || 'webp'
        input.safety_tolerance = params.safety_tolerance || 2
        if (referenceImages?.length) {
          input.input_images = referenceImages
        }
        break

      case 'nano-banana':
        input.aspect_ratio = params.aspect_ratio || '1:1'
        input.output_format = params.output_format || 'jpg'
        if (referenceImages?.length) {
          input.image_input = referenceImages
        }
        break

      case 'flux-schnell':
        input.aspect_ratio = params.aspect_ratio || '1:1'
        input.num_outputs = params.num_outputs || 1
        input.output_format = params.output_format || 'webp'
        break

      case 'flux-dev':
        input.aspect_ratio = params.aspect_ratio || '1:1'
        input.guidance = params.guidance || 3.5
        input.num_inference_steps = params.num_inference_steps || 28
        input.output_format = params.output_format || 'webp'
        break

      case 'flux-pro':
        input.aspect_ratio = params.aspect_ratio || '1:1'
        input.safety_tolerance = params.safety_tolerance || 2
        input.output_format = params.output_format || 'webp'
        break

      case 'sdxl':
        input.width = params.width || 1024
        input.height = params.height || 1024
        input.num_inference_steps = params.num_inference_steps || 25
        input.guidance_scale = params.guidance_scale || 7.5
        if (params.negative_prompt) {
          input.negative_prompt = params.negative_prompt
        }
        break

      case 'recraft-v3':
        input.style = params.style || 'any'
        input.size = params.size || '1024x1024'
        break

      case 'ideogram':
        input.aspect_ratio = params.aspect_ratio || '1:1'
        input.style_type = params.style_type || 'Auto'
        break

      default:
        // Generic handling - add common params
        if (params.aspect_ratio) input.aspect_ratio = params.aspect_ratio
        if (params.output_format) input.output_format = params.output_format
    }

    // Run the model
    const output = await replicate.run(
      modelSpec.replicateId as `${string}/${string}` | `${string}/${string}:${string}`,
      { input }
    )

    // Handle different output formats
    let imageUrl: string

    if (Array.isArray(output)) {
      // Some models return array
      const firstOutput = output[0]
      if (typeof firstOutput === 'string') {
        imageUrl = firstOutput
      } else if (firstOutput && typeof firstOutput === 'object') {
        // FileOutput object with url() method
        if ('url' in firstOutput && typeof firstOutput.url === 'function') {
          imageUrl = firstOutput.url()
        } else if ('url' in firstOutput) {
          imageUrl = firstOutput.url as string
        } else {
          throw new Error('Unexpected output format')
        }
      } else {
        throw new Error('Unexpected output format')
      }
    } else if (typeof output === 'string') {
      imageUrl = output
    } else if (output && typeof output === 'object') {
      // Single FileOutput
      if ('url' in output && typeof (output as any).url === 'function') {
        imageUrl = (output as any).url()
      } else if ('url' in output) {
        imageUrl = (output as any).url
      } else {
        throw new Error('Unexpected output format')
      }
    } else {
      throw new Error('Unexpected output format from Replicate')
    }

    return new Response(JSON.stringify({
      success: true,
      imageUrl,
      model: modelSpec.name,
      prompt,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Generation error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Generation failed'

    return new Response(JSON.stringify({
      error: errorMessage,
      code: 'GENERATION_FAILED',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
