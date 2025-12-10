'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react'
import { getApiSettings } from '@/lib/api-settings'
import { fileToBase64 } from '@/lib/image-utils'

// Types
export interface ChatAttachment {
  id: string
  type: 'image' | 'reference'
  url: string
  name: string
  file?: File
  base64?: string
  mimeType?: string
}

export interface GenerationResult {
  status: 'planning' | 'generating' | 'complete' | 'error'
  model: string
  params: Record<string, any>
  result?: {
    imageUrl: string
    prompt: string
  }
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  generation?: GenerationResult
  attachments?: ChatAttachment[]
  isStreaming?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  errorCode: string | null
  currentConversationId: string | null
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'APPEND_TO_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: { error: string | null; code?: string | null } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_CONVERSATION_ID'; payload: string | null }
  | { type: 'UPDATE_GENERATION_STATUS'; payload: { messageId: string; generation: GenerationResult } }

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  error: null,
  errorCode: null,
  currentConversationId: null,
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id
            ? { ...msg, ...action.payload.updates }
            : msg
        ),
      }

    case 'APPEND_TO_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id
            ? { ...msg, content: msg.content + action.payload.content }
            : msg
        ),
      }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload.error,
        errorCode: action.payload.code || null,
      }

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] }

    case 'SET_CONVERSATION_ID':
      return { ...state, currentConversationId: action.payload }

    case 'UPDATE_GENERATION_STATUS':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.messageId
            ? { ...msg, generation: action.payload.generation }
            : msg
        ),
      }

    default:
      return state
  }
}

// Skill data for API
export interface SkillForApi {
  name: string
  shortcut: string
  icon?: string
  content: string
}

// Context
interface ChatContextValue {
  state: ChatState
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  appendToMessage: (id: string, content: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null, code?: string | null) => void
  clearMessages: () => void
  clearError: () => void
  setConversationId: (id: string | null) => void
  updateGenerationStatus: (messageId: string, generation: GenerationResult) => void
  sendMessage: (content: string, attachments?: ChatAttachment[], skillsContext?: string, referencedSkills?: SkillForApi[]) => Promise<void>
}

const ChatContext = createContext<ChatContextValue | null>(null)

// Generate unique ID
function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Provider
export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState)

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const id = generateId()
    dispatch({
      type: 'ADD_MESSAGE',
      payload: { ...message, id, timestamp: new Date() },
    })
    return id
  }, [])

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id, updates } })
  }, [])

  const appendToMessage = useCallback((id: string, content: string) => {
    dispatch({ type: 'APPEND_TO_MESSAGE', payload: { id, content } })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [])

  const setError = useCallback((error: string | null, code?: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: { error, code } })
  }, [])

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: { error: null, code: null } })
  }, [])

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' })
  }, [])

  const setConversationId = useCallback((id: string | null) => {
    dispatch({ type: 'SET_CONVERSATION_ID', payload: id })
  }, [])

  const updateGenerationStatus = useCallback((messageId: string, generation: GenerationResult) => {
    dispatch({ type: 'UPDATE_GENERATION_STATUS', payload: { messageId, generation } })
  }, [])

  const sendMessage = useCallback(async (content: string, attachments?: ChatAttachment[], skillsContext?: string, referencedSkills?: SkillForApi[]) => {
    // Get API settings
    const settings = getApiSettings()

    // Check for API key first
    if (!settings.googleApiKey) {
      setError('Please add your Google AI API key in Settings to start chatting.', 'NO_API_KEY')
      return
    }

    // Convert attachments to base64 if they have files
    let processedAttachments = attachments
    if (attachments && attachments.length > 0) {
      processedAttachments = await Promise.all(
        attachments.map(async (attachment) => {
          if (attachment.type === 'image' && attachment.file && !attachment.base64) {
            const base64DataUrl = await fileToBase64(attachment.file)
            // Remove the data:image/...;base64, prefix to get just the base64 data
            const base64 = base64DataUrl.split(',')[1]
            return {
              ...attachment,
              base64,
              mimeType: attachment.file.type,
            }
          }
          return attachment
        })
      )
    }

    // Add user message
    const userMessageId = addMessage({
      role: 'user',
      content,
      attachments: processedAttachments,
    })

    // Create placeholder for assistant response
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
    })

    setLoading(true)
    setError(null)

    try {
      // Prepare messages for API (excluding the streaming placeholder)
      const apiMessages = state.messages
        .filter(m => m.id !== assistantMessageId)
        .concat({ id: userMessageId, role: 'user', content, timestamp: new Date(), attachments: processedAttachments })
        .map(m => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments?.map(a => ({
            type: a.type,
            url: a.url,
            name: a.name,
            base64: a.base64,
            mimeType: a.mimeType,
          })),
        }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          apiKey: settings.googleApiKey,
          modelId: settings.selectedModelId,
          skillsContext,
          referencedSkills,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (errorData.code === 'NO_API_KEY') {
          throw new Error('Please add your Google AI API key in Settings.')
        }
        throw new Error(errorData.error || 'Failed to send message')
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)

              // Check for errors in stream
              if (parsed.error) {
                updateMessage(assistantMessageId, {
                  content: parsed.error,
                  isStreaming: false,
                })
                setError(parsed.error, parsed.code)
                return
              }

              if (parsed.content) {
                appendToMessage(assistantMessageId, parsed.content)
              }
              if (parsed.generation) {
                updateGenerationStatus(assistantMessageId, parsed.generation)
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      // Mark streaming as complete
      updateMessage(assistantMessageId, { isStreaming: false })

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      updateMessage(assistantMessageId, {
        content: errorMessage,
        isStreaming: false,
      })
    } finally {
      setLoading(false)
    }
  }, [state.messages, addMessage, appendToMessage, updateMessage, updateGenerationStatus, setLoading, setError])

  const value: ChatContextValue = {
    state,
    addMessage,
    updateMessage,
    appendToMessage,
    setLoading,
    setError,
    clearMessages,
    clearError,
    setConversationId,
    updateGenerationStatus,
    sendMessage,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

// Hook
export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
