import { GoogleGenerativeAI } from '@google/generative-ai'
import { generateSystemPrompt } from '@/lib/orchestrator/system-prompt'
import { getEffectiveGeminiApiKey, isPlatformOrchestrationActive } from '@/lib/platform-settings'
import { calculateGeminiCost } from '@/lib/gemini-pricing'
import { sbAdmin } from '@/lib/supabaseAdmin'

// Use nodejs runtime to support longer generation times (edge has 30s limit)
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes to match generate route

// Image purpose types - must match frontend
type ImagePurpose = 'reference' | 'starting_frame' | 'edit_target' | 'last_frame'

interface ChatAttachment {
  type: 'image' | 'reference'
  url: string
  name: string
  base64?: string
  mimeType?: string
  purpose?: ImagePurpose  // User-selected purpose for the image
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: ChatAttachment[]
}

interface SkillData {
  name: string
  shortcut: string
  icon?: string
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  apiKey: string
  modelId?: string
  skillsContext?: string  // Formatted skills for system prompt
  referencedSkills?: SkillData[]  // Skills referenced in the current message
  selectedGenerationModelId?: string  // The generation model selected by the user
}

interface GenerationBlock {
  model: string
  prompt: string
  params: Record<string, any>
  // Video-specific fields
  duration?: number
  resolution?: string
  // Seedream 4.5 sequential generation fields
  sequentialImageGeneration?: 'disabled' | 'auto'
  maxImages?: number
}

interface SkillCreationBlock {
  name: string
  shortcut: string
  description: string
  category: 'style' | 'technique' | 'tool' | 'workflow' | 'custom'
  icon?: string
  content: string
  tags?: string[]
  examples?: string[]
}

// Parse generation blocks from AI response
function parseGenerationBlock(text: string): GenerationBlock | null {
  const regex = /```generate\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.model && json.prompt) {
      return {
        model: json.model,
        prompt: json.prompt,
        params: json.params || {},
        // Video-specific fields
        duration: json.duration,
        resolution: json.resolution,
        // Seedream 4.5 sequential generation fields
        sequentialImageGeneration: json.sequentialImageGeneration,
        maxImages: json.maxImages,
      }
    }
  } catch (e) {
    console.error('Failed to parse generation block:', e)
  }

  return null
}

// Parse skill creation blocks from AI response
function parseSkillCreationBlock(text: string): SkillCreationBlock | null {
  const regex = /```create-skill\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.name && json.shortcut && json.content) {
      return {
        name: json.name,
        shortcut: json.shortcut,
        description: json.description || '',
        category: json.category || 'custom',
        icon: json.icon,
        content: json.content,
        tags: json.tags || [],
        examples: json.examples || [],
      }
    }
  } catch (e) {
    console.error('Failed to parse skill creation block:', e)
  }

  return null
}

// Remove the generation block from text (so it's not shown in chat)
function stripGenerationBlock(text: string): string {
  return text.replace(/```generate\s*\n[\s\S]*?\n```/g, '').trim()
}

// Storyboard Mode: Parse shot-list blocks from AI response
interface ShotListItem {
  shotNumber: number
  title?: string
  description: string
  cameraAngle?: string
  cameraMovement?: string
  mediaType?: 'image' | 'video'
  entities?: string[]
  suggestedPrompt?: string
}

interface ShotListBlock {
  shots: ShotListItem[]
}

function parseShotListBlock(text: string): ShotListBlock | null {
  const regex = /```shot-list\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.shots && Array.isArray(json.shots)) {
      return {
        shots: json.shots.map((shot: any) => ({
          shotNumber: shot.shotNumber || 0,
          title: shot.title,
          description: shot.description || '',
          cameraAngle: shot.cameraAngle,
          cameraMovement: shot.cameraMovement,
          mediaType: shot.mediaType || 'image',
          entities: shot.entities || [],
          suggestedPrompt: shot.suggestedPrompt,
        }))
      }
    }
  } catch (e) {
    console.error('Failed to parse shot-list block:', e)
  }

  return null
}

// Storyboard Mode: Parse entity suggestion blocks from AI response
interface EntitySuggestionItem {
  name: string
  type: 'character' | 'world' | 'object' | 'style'
  description?: string
}

interface EntitySuggestionBlock {
  entities: EntitySuggestionItem[]
}

function parseEntitySuggestionBlock(text: string): EntitySuggestionBlock | null {
  const regex = /```entity-suggestion\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.entities && Array.isArray(json.entities)) {
      return {
        entities: json.entities.map((entity: any) => ({
          name: entity.name || 'Unknown',
          type: entity.type || 'character',
          description: entity.description,
        }))
      }
    }
  } catch (e) {
    console.error('Failed to parse entity-suggestion block:', e)
  }

  return null
}

// Supported model IDs
const SUPPORTED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemma-3-27b-it',
  'gemma-3-12b-it',
]

// Models that support vision/image input
const VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]

export async function POST(request: Request) {
  try {
    const { messages, apiKey, modelId, skillsContext, referencedSkills, selectedGenerationModelId } = await request.json() as ChatRequest

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if platform orchestration is active (admin provides the key)
    const isPlatformMode = await isPlatformOrchestrationActive()

    // Get Whop user ID from headers for tracking
    const whopUserId = request.headers.get('x-whop-user-id') || null

    // Get effective API key (platform key, user key, or env variable)
    let effectiveApiKey: string
    try {
      effectiveApiKey = await getEffectiveGeminiApiKey(apiKey)
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'API key required. Please add your Google AI API key in Settings.',
        code: 'NO_API_KEY'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate model ID - default to gemini-2.5-flash for best quality
    const effectiveModelId = modelId && SUPPORTED_MODELS.includes(modelId)
      ? modelId
      : 'gemini-2.5-flash'

    const supportsVision = VISION_MODELS.includes(effectiveModelId)

    // Initialize Gemini with the API key
    const genAI = new GoogleGenerativeAI(effectiveApiKey)

    // Build system prompt with skills context
    let systemPrompt = generateSystemPrompt()

    // Append skills context if provided
    if (skillsContext) {
      systemPrompt += skillsContext
    }

    // Add specific instructions for referenced skills
    if (referencedSkills && referencedSkills.length > 0) {
      systemPrompt += '\n\n## Currently Referenced Skills\n'
      systemPrompt += 'The user has referenced the following skills in their message. Apply these guidelines:\n\n'
      for (const skill of referencedSkills) {
        systemPrompt += `### ${skill.icon || '📌'} ${skill.name} (@${skill.shortcut})\n`
        systemPrompt += `${skill.content}\n\n`
      }
    }

    // Check if Creative Consultant mode (chat-only, no generation)
    const isConsultantMode = selectedGenerationModelId === 'creative-consultant'

    if (isConsultantMode) {
      // Override system prompt for consultant mode - pure brainstorming, no generation
      systemPrompt += `\n\n## CREATIVE CONSULTANT MODE (Chat Only)\n`
      systemPrompt += `IMPORTANT: The user has selected "Creative Consultant" mode. This means:\n`
      systemPrompt += `- DO NOT generate any images or videos\n`
      systemPrompt += `- DO NOT use the generate_image or generate_video tools\n`
      systemPrompt += `- DO NOT provide cost estimates or ask to confirm generation\n`
      systemPrompt += `- Focus ONLY on brainstorming, ideation, and prompt crafting\n\n`
      systemPrompt += `Your role in this mode:\n`
      systemPrompt += `1. Help users brainstorm creative ideas and concepts\n`
      systemPrompt += `2. Craft and refine detailed prompts for future generation\n`
      systemPrompt += `3. Discuss creative direction, style, composition, and techniques\n`
      systemPrompt += `4. Explain what different models are good at\n`
      systemPrompt += `5. Provide artistic feedback and suggestions\n\n`
      systemPrompt += `When the user is ready to generate, suggest they select an image or video model from the model picker.\n`
      systemPrompt += `You can say things like "When you're ready to bring this to life, select FLUX Pro or another model to generate!"\n`
    } else if (selectedGenerationModelId) {
      // Normal generation mode with pre-selected model
      systemPrompt += `\n\n## User's Selected Generation Model\n`
      systemPrompt += `CRITICAL: The user has pre-selected "${selectedGenerationModelId}" in the UI.\n`
      systemPrompt += `This means they know exactly which model they want - DO NOT:\n`
      systemPrompt += `- Ask them to confirm the model choice\n`
      systemPrompt += `- Recommend a different model\n`
      systemPrompt += `- Ask what type of content they want to create (they chose the model already)\n\n`
      systemPrompt += `Instead, skip directly to Step 2 (Prompt Crafting) and use "${selectedGenerationModelId}" for generation.\n`
      systemPrompt += `Only offer model alternatives if they explicitly ask or if their request is impossible with this model.\n`
    }

    // Get the model
    const model = genAI.getGenerativeModel({
      model: effectiveModelId,
      systemInstruction: systemPrompt,
    })

    // Purpose labels for context injection
    const PURPOSE_CONTEXT: Record<ImagePurpose, string> = {
      reference: 'REFERENCE IMAGE (style/content reference, ingredients for the generation)',
      starting_frame: 'STARTING FRAME (first frame for video generation, image-to-video)',
      edit_target: 'EDIT TARGET (image to be modified/edited)',
      last_frame: 'LAST FRAME (end frame for video generation)',
    }

    // Convert messages to Gemini format with image support
    const convertMessageToParts = (msg: ChatMessage) => {
      const parts: any[] = []

      // Add text content
      if (msg.content) {
        parts.push({ text: msg.content })
      }

      // Add image context to message - both local uploads AND Skinny Hub references
      // This ensures the AI orchestrator knows about ALL attached images
      if (msg.attachments?.length) {
        // Get all image attachments - both 'image' (local) and 'reference' (Skinny Hub)
        const allImageAttachments = msg.attachments.filter(a =>
          (a.type === 'image' || a.type === 'reference') && (a.base64 || a.url)
        )

        if (allImageAttachments.length > 0) {
          // Add context text about ALL images (regardless of base64) so AI knows they exist
          const imageContexts = allImageAttachments.map((att, i) => {
            const purposeLabel = att.purpose ? PURPOSE_CONTEXT[att.purpose] : 'REFERENCE IMAGE'
            return `[Image ${i + 1}: ${purposeLabel}]`
          }).join('\n')

          parts.push({ text: `\n\n--- ATTACHED IMAGES ---\n${imageContexts}\n` })

          // Add inline image data ONLY for images with base64 (vision models only)
          if (supportsVision) {
            const base64Attachments = allImageAttachments.filter(a => a.base64 && a.mimeType)
            for (const attachment of base64Attachments) {
              parts.push({
                inlineData: {
                  data: attachment.base64,
                  mimeType: attachment.mimeType,
                }
              })
            }
          }
        }
      }

      return parts
    }

    // Build history (all messages except the last one)
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: convertMessageToParts(msg),
    }))

    // Get the last message
    const lastMessage = messages[messages.length - 1]
    const lastMessageParts = convertMessageToParts(lastMessage)

    // Start chat with history
    const chat = model.startChat({
      history: history as any,
    })

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream the response - pass parts array for multimodal
          const result = await chat.sendMessageStream(lastMessageParts)

          let fullResponse = ''
          let generationTriggered = false

          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              fullResponse += text

              // Send the content chunk
              const data = JSON.stringify({ content: text })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))

              // Check for complete generation block
              if (!generationTriggered) {
                const genBlock = parseGenerationBlock(fullResponse)
                if (genBlock) {
                  generationTriggered = true

                  // Send generation status: planning
                  const planningData = JSON.stringify({
                    generation: {
                      status: 'planning',
                      model: genBlock.model,
                      params: genBlock.params,
                    }
                  })
                  controller.enqueue(encoder.encode(`data: ${planningData}\n\n`))
                }
              }
            }
          }

          // Track token usage after streaming completes
          try {
            const aggregatedResponse = await result.response
            const usage = aggregatedResponse.usageMetadata

            if (usage && usage.promptTokenCount && usage.candidatesTokenCount) {
              const estimatedCost = calculateGeminiCost(
                effectiveModelId,
                usage.promptTokenCount,
                usage.candidatesTokenCount
              )

              // Log to gemini_usage table
              await sbAdmin.from('gemini_usage').insert({
                whop_user_id: whopUserId,
                prompt_tokens: usage.promptTokenCount,
                response_tokens: usage.candidatesTokenCount,
                total_tokens: usage.totalTokenCount || (usage.promptTokenCount + usage.candidatesTokenCount),
                model: effectiveModelId,
                estimated_cost_cents: estimatedCost,
                is_platform_key: isPlatformMode,
              })

              console.log('[Chat] Token usage logged:', {
                promptTokens: usage.promptTokenCount,
                responseTokens: usage.candidatesTokenCount,
                model: effectiveModelId,
                estimatedCostCents: estimatedCost,
                isPlatformKey: isPlatformMode,
              })
            }
          } catch (usageError) {
            // Don't fail the request if usage tracking fails
            console.error('[Chat] Failed to track token usage:', usageError)
          }

          // After streaming is complete, check for skill creation block
          const skillBlock = parseSkillCreationBlock(fullResponse)
          if (skillBlock) {
            // Send skill creation event to client
            const skillData = JSON.stringify({
              skillCreation: skillBlock
            })
            controller.enqueue(encoder.encode(`data: ${skillData}\n\n`))
          }

          // After streaming is complete, check for generation block (skip in consultant mode)
          const genBlock = isConsultantMode ? null : parseGenerationBlock(fullResponse)
          if (genBlock) {
            // Send generating status
            const generatingData = JSON.stringify({
              generation: {
                status: 'generating',
                model: genBlock.model,
                params: genBlock.params,
              }
            })
            controller.enqueue(encoder.encode(`data: ${generatingData}\n\n`))

            try {
              // Call the generation API - forward auth headers for user identification
              const forwardHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
              }

              // Forward Whop authentication headers
              const whopToken = request.headers.get('x-whop-user-token')
              const whopUserId = request.headers.get('x-whop-user-id')
              const cookie = request.headers.get('cookie')

              if (whopToken) forwardHeaders['x-whop-user-token'] = whopToken
              if (whopUserId) forwardHeaders['x-whop-user-id'] = whopUserId
              if (cookie) forwardHeaders['cookie'] = cookie

              // Collect images from the ENTIRE conversation history (not just last message)
              // This is critical: user might attach an image in message 1, then confirm in message 3
              // We need to find all images across the conversation
              // Include base64 data so generate route can upload to storage if needed
              // Include both 'image' and 'reference' types (from Skinny Hub)
              const imagesWithPurposes: Array<{
                url: string
                base64?: string
                mimeType?: string
                purpose: string
              }> = []

              // Iterate through ALL messages (most recent first) to find images
              // This ensures we capture images from earlier in the conversation
              for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i]
                if (msg.role === 'user' && msg.attachments?.length) {
                  const imageAttachments = msg.attachments.filter(
                    att => (att.type === 'image' || att.type === 'reference') && (att.base64 || att.url)
                  )
                  for (const att of imageAttachments) {
                    // Only add if we don't already have an image with this purpose
                    // (prefer more recent images for each purpose)
                    const existingWithPurpose = imagesWithPurposes.find(
                      img => img.purpose === (att.purpose || 'reference')
                    )
                    if (!existingWithPurpose) {
                      imagesWithPurposes.push({
                        url: att.url,
                        base64: att.base64,
                        mimeType: att.mimeType,
                        purpose: att.purpose || 'reference',
                      })
                    }
                  }
                }
              }

              // Log attachment debugging info
              console.log('[Chat] Total messages in conversation:', messages.length)
              console.log('[Chat] Last message attachments:', lastMessage.attachments?.length || 0)
              console.log('[Chat] Images collected from conversation history:', imagesWithPurposes.length)
              if (imagesWithPurposes.length > 0) {
                console.log('[Chat] Images detail:', JSON.stringify(imagesWithPurposes.map(i => ({
                  purpose: i.purpose,
                  hasUrl: !!i.url,
                  hasBase64: !!i.base64,
                  urlType: i.url?.startsWith('http') ? 'http' : i.url?.startsWith('blob') ? 'blob' : 'other',
                  urlPreview: i.url?.slice(0, 80)
                }))))
              } else {
                console.warn('[Chat] WARNING: No images found in conversation history!')
              }

              console.log('[Chat] Calling generate API for model:', genBlock.model)
              const generateUrl = new URL('/api/generate', request.url).href
              console.log('[Chat] Generate URL:', generateUrl)

              const genResponse = await fetch(generateUrl, {
                method: 'POST',
                headers: forwardHeaders,
                body: JSON.stringify({
                  model: genBlock.model,
                  prompt: genBlock.prompt,
                  params: genBlock.params,
                  // Video-specific fields
                  duration: genBlock.duration,
                  resolution: genBlock.resolution,
                  // Seedream 4.5 sequential generation fields
                  sequentialImageGeneration: genBlock.sequentialImageGeneration,
                  maxImages: genBlock.maxImages,
                  // Pass images with purposes
                  images: imagesWithPurposes.length > 0 ? imagesWithPurposes : undefined,
                  // Always return immediately for frontend polling (Netlify SSE compatibility)
                  noWait: true,
                }),
              })

              console.log('[Chat] Generate response status:', genResponse.status, genResponse.statusText)
              const genResultText = await genResponse.text()
              console.log('[Chat] Generate response text (first 500 chars):', genResultText.slice(0, 500))

              let genResult: any
              try {
                genResult = JSON.parse(genResultText)
              } catch (parseError) {
                console.error('[Chat] Failed to parse generate response:', parseError)
                throw new Error(`Generate API returned invalid JSON: ${genResultText.slice(0, 200)}`)
              }

              if (genResult.success && genResult.imageUrl) {
                console.log('[Chat] Generation successful! imageUrl:', genResult.imageUrl)
                console.log('[Chat] All output URLs:', genResult.outputUrls)
                // Send complete status with result - include all output URLs for sequential generation
                const completeData = JSON.stringify({
                  generation: {
                    status: 'complete',
                    model: genBlock.model,
                    params: genBlock.params,
                    result: {
                      imageUrl: genResult.imageUrl,
                      outputUrls: genResult.outputUrls || [genResult.imageUrl],
                      prompt: genBlock.prompt,
                    }
                  }
                })
                console.log('[Chat] Sending complete data to stream')
                controller.enqueue(encoder.encode(`data: ${completeData}\n\n`))
                console.log('[Chat] Complete data sent')
              } else if (genResult.pending && genResult.generationId) {
                // Generation is still processing - DON'T poll here!
                // Netlify will timeout before completion (10-26s limit)
                // Send generationId to frontend for client-side polling
                console.log('[Chat] Generation pending, sending generationId for frontend polling:', genResult.generationId)
                const pendingData = JSON.stringify({
                  generation: {
                    status: 'generating',  // Keep as generating (frontend will poll)
                    model: genBlock.model,
                    params: genBlock.params,
                    generationId: genResult.generationId,  // Frontend needs this to poll
                  }
                })
                controller.enqueue(encoder.encode(`data: ${pendingData}\n\n`))
              } else {
                console.log('[Chat] Generation failed:', genResult.error || 'Unknown error')
                console.log('[Chat] Error code:', genResult.code)
                // Send error status with all details (including balance info if applicable)
                const errorData = JSON.stringify({
                  generation: {
                    status: 'error',
                    model: genBlock.model,
                    params: genBlock.params,
                    error: genResult.error || 'Generation failed',
                    code: genResult.code,
                    required: genResult.required,
                    available: genResult.available,
                  }
                })
                controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
              }
            } catch (genError: any) {
              console.error('Generation error:', genError)
              const errorData = JSON.stringify({
                generation: {
                  status: 'error',
                  model: genBlock.model,
                  params: genBlock.params,
                  error: genError.message || 'Generation failed',
                }
              })
              controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
            }
          }

          // Send done marker
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error: any) {
          console.error('Streaming error:', error)

          // Handle specific error types
          let errorMessage = 'An error occurred'
          let errorCode = 'UNKNOWN_ERROR'

          if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key')) {
            errorMessage = 'Invalid API key. Please check your Google AI API key in Settings.'
            errorCode = 'INVALID_API_KEY'
          } else if (error.message?.includes('quota') || error.message?.includes('rate')) {
            errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
            errorCode = 'RATE_LIMITED'
          } else if (error.message?.includes('not found') || error.message?.includes('not supported')) {
            errorMessage = 'Model not available. Try a different model in Settings.'
            errorCode = 'MODEL_NOT_FOUND'
          } else if (error.message?.includes('image') || error.message?.includes('vision')) {
            errorMessage = 'This model does not support images. Try Gemini 2.5 Flash.'
            errorCode = 'NO_VISION_SUPPORT'
          }

          const errorData = JSON.stringify({
            error: errorMessage,
            code: errorCode,
          })
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
