import { GoogleGenerativeAI } from '@google/generative-ai'
import { generateSystemPrompt } from '@/lib/orchestrator/system-prompt'

export const runtime = 'edge'

interface ImageData {
  base64: string
  mimeType: string
}

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
    const { messages, apiKey, modelId, skillsContext, referencedSkills } = await request.json() as ChatRequest

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

          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              const data = JSON.stringify({ content: text })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
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
