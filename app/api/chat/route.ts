import { GoogleGenerativeAI } from '@google/generative-ai'
import { generateSystemPrompt } from '@/lib/orchestrator/system-prompt'

export const runtime = 'edge'

interface ChatAttachment {
  type: 'image' | 'reference'
  url: string
  name: string
  base64?: string
  mimeType?: string
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

    // Use provided API key or fall back to env variable
    const effectiveApiKey = apiKey || process.env.GOOGLE_AI_API_KEY

    if (!effectiveApiKey) {
      return new Response(JSON.stringify({
        error: 'API key required. Please add your Google AI API key in Settings.',
        code: 'NO_API_KEY'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate model ID
    const effectiveModelId = modelId && SUPPORTED_MODELS.includes(modelId)
      ? modelId
      : 'gemini-2.0-flash-lite'

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

    // Add selected generation model context
    if (selectedGenerationModelId) {
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

    // Convert messages to Gemini format with image support
    const convertMessageToParts = (msg: ChatMessage) => {
      const parts: any[] = []

      // Add text content
      if (msg.content) {
        parts.push({ text: msg.content })
      }

      // Add images if model supports vision and message has attachments
      if (supportsVision && msg.attachments?.length) {
        for (const attachment of msg.attachments) {
          if (attachment.type === 'image' && attachment.base64 && attachment.mimeType) {
            parts.push({
              inlineData: {
                data: attachment.base64,
                mimeType: attachment.mimeType,
              }
            })
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

          // After streaming is complete, check for skill creation block
          const skillBlock = parseSkillCreationBlock(fullResponse)
          if (skillBlock) {
            // Send skill creation event to client
            const skillData = JSON.stringify({
              skillCreation: skillBlock
            })
            controller.enqueue(encoder.encode(`data: ${skillData}\n\n`))
          }

          // After streaming is complete, check for generation block
          const genBlock = parseGenerationBlock(fullResponse)
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
              // Call the generation API
              const genResponse = await fetch(new URL('/api/generate', request.url).href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: genBlock.model,
                  prompt: genBlock.prompt,
                  params: genBlock.params,
                }),
              })

              const genResult = await genResponse.json()

              if (genResult.success && genResult.imageUrl) {
                // Send complete status with result
                const completeData = JSON.stringify({
                  generation: {
                    status: 'complete',
                    model: genBlock.model,
                    params: genBlock.params,
                    result: {
                      imageUrl: genResult.imageUrl,
                      prompt: genBlock.prompt,
                    }
                  }
                })
                controller.enqueue(encoder.encode(`data: ${completeData}\n\n`))
              } else {
                // Send error status
                const errorData = JSON.stringify({
                  generation: {
                    status: 'error',
                    model: genBlock.model,
                    params: genBlock.params,
                    error: genResult.error || 'Generation failed',
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
