'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect, useState, useRef } from 'react'
import { getApiSettings } from '@/lib/api-settings'
import { fileToBase64 } from '@/lib/image-utils'
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from '@/lib/storage'
import { toast } from 'sonner'

// Types
export type ImagePurpose = 'reference' | 'starting_frame' | 'edit_target' | 'last_frame' | 'analyze'

export const IMAGE_PURPOSE_LABELS: Record<ImagePurpose, string> = {
  reference: 'Reference',
  starting_frame: 'Start Frame',
  edit_target: 'Edit',
  last_frame: 'End Frame',
  analyze: 'Analyze',
}

export const IMAGE_PURPOSE_DESCRIPTIONS: Record<ImagePurpose, string> = {
  reference: 'Style or content reference (ingredients)',
  starting_frame: 'First frame for video generation',
  edit_target: 'Image to modify or edit',
  last_frame: 'End frame for video (Veo)',
  analyze: 'AI analyzes the image content for context',
}

export interface ChatAttachment {
  id: string
  type: 'image' | 'reference'
  url: string
  name: string
  file?: File
  base64?: string
  mimeType?: string
  purpose?: ImagePurpose
  // AI image analysis fields
  analysis?: string
  analysisStatus?: 'pending' | 'analyzing' | 'complete' | 'error'
}

export interface GenerationResult {
  status: 'planning' | 'generating' | 'complete' | 'error'
  model: string
  params: Record<string, any>
  generationId?: string  // Database ID for frontend polling when pending
  result?: {
    imageUrl: string
    outputUrls?: string[]  // For sequential generation (multiple images)
    prompt: string
    pending?: boolean  // True if still processing in background
    message?: string   // Message to display when pending
    referenceImages?: Array<{ url: string; purpose: string }>  // Reference images used in generation
  }
  error?: string
  // Balance error fields
  code?: string
  required?: number  // cents required for generation
  available?: number // cents available in balance
}

// Director's Notes from AI
export interface DirectorsNotes {
  modelChoice: string
  promptEnhancements: string
  parameterReasoning: string
  tips: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  generation?: GenerationResult
  directorsNotes?: DirectorsNotes
  attachments?: ChatAttachment[]
  isStreaming?: boolean
}

// Conversation type for chat history
export interface Conversation {
  id: string  // Local ID (can be any format)
  serverId?: string  // Server-side UUID from Supabase (for syncing)
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  errorCode: string | null
  currentConversationId: string | null
  conversations: Conversation[]
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
  | { type: 'LOAD_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'UPDATE_CONVERSATION'; payload: { id: string; updates: Partial<Conversation> } }
  | { type: 'DELETE_CONVERSATION'; payload: string }
  | { type: 'SWITCH_CONVERSATION'; payload: { conversationId: string; messages: ChatMessage[] } }

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  error: null,
  errorCode: null,
  currentConversationId: null,
  conversations: [],
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

    case 'LOAD_CONVERSATIONS':
      return { ...state, conversations: action.payload }

    case 'ADD_CONVERSATION':
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      }

    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map((conv) =>
          conv.id === action.payload.id
            ? { ...conv, ...action.payload.updates }
            : conv
        ),
      }

    case 'DELETE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.filter((conv) => conv.id !== action.payload),
        // If deleting current conversation, clear messages
        messages: state.currentConversationId === action.payload ? [] : state.messages,
        currentConversationId: state.currentConversationId === action.payload ? null : state.currentConversationId,
      }

    case 'SWITCH_CONVERSATION':
      return {
        ...state,
        currentConversationId: action.payload.conversationId,
        messages: action.payload.messages,
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

// Skill creation data from AI
export interface SkillCreationData {
  name: string
  shortcut: string
  description: string
  category: 'style' | 'technique' | 'tool' | 'workflow' | 'custom'
  icon?: string
  content: string
  tags?: string[]
  examples?: string[]
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
  sendMessage: (content: string, attachments?: ChatAttachment[], skillsContext?: string, referencedSkills?: SkillForApi[], selectedGenerationModelId?: string) => Promise<void>
  // Conversation management
  createNewConversation: () => void
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  saveCurrentConversation: () => void
  // Skill creation callback
  onSkillCreation: ((skill: SkillCreationData) => void) | null
  setOnSkillCreation: (callback: ((skill: SkillCreationData) => void) | null) => void
  // Generation completion callback (to refresh gallery/library)
  onGenerationComplete: (() => void) | null
  setOnGenerationComplete: (callback: (() => void) | null) => void
  // Insufficient balance callback (to show modal from app context)
  onInsufficientBalance: ((required: number, available: number, modelName?: string) => void) | null
  setOnInsufficientBalance: (callback: ((required: number, available: number, modelName?: string) => void) | null) => void
  // Platform orchestration status
  platformEnabled: boolean
  platformLoading: boolean
}

const ChatContext = createContext<ChatContextValue | null>(null)

// Generate unique ID
function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Provider
export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState)
  const [onSkillCreationCallback, setOnSkillCreationCallback] = useState<((skill: SkillCreationData) => void) | null>(null)
  const [onGenerationCompleteCallback, setOnGenerationCompleteCallback] = useState<(() => void) | null>(null)
  const [onInsufficientBalanceCallback, setOnInsufficientBalanceCallback] = useState<((required: number, available: number, modelName?: string) => void) | null>(null)

  // Platform orchestration status
  const [platformEnabled, setPlatformEnabled] = useState(false)
  const [platformLoading, setPlatformLoading] = useState(true)

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

  // Poll for generation completion when server returns a pending generationId
  const pollForGenerationComplete = useCallback(async (
    generationId: string,
    messageId: string,
    model: string,
    params: Record<string, any>
  ) => {
    const POLL_INTERVAL_MS = 3000 // 3 seconds

    // Use longer timeout for multi-image generations (SeedDream sequential mode takes longer)
    const numOutputs = params.numOutputs || params.num_outputs || 1
    const isSequential = numOutputs > 1
    const POLL_TIMEOUT_MS = isSequential
      ? 600000  // 10 minutes for sequential/multi-image generations
      : 300000  // 5 minutes for single images

    const startTime = Date.now()

    console.log('[ChatContext] Starting poll for generation:', generationId, 'numOutputs:', numOutputs, 'timeout:', POLL_TIMEOUT_MS / 1000, 's')

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

      try {
        // Use Whop auth headers for the polling request
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }

        // Get Whop token from localStorage (dev mode) or cookies
        if (typeof window !== 'undefined') {
          // First check localStorage (dev mode)
          const devToken = localStorage.getItem('whop-dev-token')
          const devUserId = localStorage.getItem('whop-dev-user-id')

          if (devToken) {
            headers['x-whop-user-token'] = devToken
          }
          if (devUserId) {
            headers['x-whop-user-id'] = devUserId
          }

          // Fallback to cookies if no localStorage values
          if (!devToken) {
            const whopToken = document.cookie
              .split('; ')
              .find(row => row.startsWith('whop_user_token='))
              ?.split('=')[1]
            if (whopToken) headers['x-whop-user-token'] = whopToken
          }
          if (!devUserId) {
            const whopUserId = document.cookie
              .split('; ')
              .find(row => row.startsWith('whop_user_id='))
              ?.split('=')[1]
            if (whopUserId) headers['x-whop-user-id'] = whopUserId
          }
        }

        const res = await fetch(`/api/generations/${generationId}`, { headers })
        if (!res.ok) {
          console.log('[ChatContext] Poll request failed:', res.status)
          continue
        }

        const generation = await res.json()
        console.log('[ChatContext] Poll result:', generation.replicate_status, 'URLs:', generation.output_urls?.length || 0)

        if (generation.replicate_status === 'succeeded' && generation.output_urls?.length > 0) {
          console.log('[ChatContext] Generation complete! Updating message.')
          updateGenerationStatus(messageId, {
            status: 'complete',
            model,
            params,
            result: {
              imageUrl: generation.output_urls[0],
              outputUrls: generation.output_urls,
              prompt: generation.prompt,
            }
          })

          // Show toast notification for generation completion
          const isVideo = model?.toLowerCase().includes('veo') || model?.toLowerCase().includes('wan') || model?.toLowerCase().includes('kling')
          const costCents = generation.cost_cents
          toast.success(isVideo ? 'Video ready!' : 'Image ready!', {
            description: costCents ? `$${(costCents / 100).toFixed(2)} charged` : model,
            duration: 5000,
          })

          if (onGenerationCompleteCallback) {
            console.log('[ChatContext] Calling generation complete callback')
            onGenerationCompleteCallback()
          }
          return
        } else if (generation.replicate_status === 'failed') {
          console.log('[ChatContext] Generation failed:', generation.replicate_error)
          updateGenerationStatus(messageId, {
            status: 'error',
            model,
            params,
            error: generation.replicate_error || 'Generation failed',
          })

          // Show toast notification for generation failure
          toast.error('Generation failed', {
            description: generation.replicate_error || 'An error occurred',
            duration: 5000,
          })

          return
        }
        // Still processing - continue polling
      } catch (err) {
        console.error('[ChatContext] Polling error:', err)
      }
    }

    // Timeout - show pending message
    console.log('[ChatContext] Polling timed out after 5 minutes')
    updateGenerationStatus(messageId, {
      status: 'complete',
      model,
      params,
      result: {
        imageUrl: '',
        outputUrls: [],
        prompt: '',
        pending: true,
        message: 'Generation is taking longer than expected. Check your Library.',
      }
    })
  }, [updateGenerationStatus, onGenerationCompleteCallback])

  const sendMessage = useCallback(async (content: string, attachments?: ChatAttachment[], skillsContext?: string, referencedSkills?: SkillForApi[], selectedGenerationModelId?: string) => {
    // Get API settings
    const settings = getApiSettings()

    // Check for API key - skip if platform mode is enabled (server will use platform key)
    if (!platformEnabled && !settings.googleApiKey) {
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
            purpose: a.purpose,
            analysis: a.analysis,  // Include AI analysis for orchestrator context
          })),
        }))

      // Build headers including Whop authentication from localStorage
      const chatHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // Add Whop auth headers if available (for generation saving)
      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) chatHeaders['x-whop-user-token'] = devToken
        if (devUserId) chatHeaders['x-whop-user-id'] = devUserId
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: chatHeaders,
        body: JSON.stringify({
          messages: apiMessages,
          apiKey: settings.googleApiKey,
          modelId: settings.selectedModelId,
          skillsContext,
          referencedSkills,
          selectedGenerationModelId,
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
                console.log('[ChatContext] Received generation update:', {
                  status: parsed.generation.status,
                  model: parsed.generation.model,
                  hasResult: !!parsed.generation.result,
                  imageUrl: parsed.generation.result?.imageUrl?.slice(0, 60),
                  outputUrlsCount: parsed.generation.result?.outputUrls?.length,
                  code: parsed.generation.code,
                  fullGeneration: JSON.stringify(parsed.generation).slice(0, 500)
                })
                updateGenerationStatus(assistantMessageId, parsed.generation)

                // If we received a generationId but status is still 'generating', start frontend polling
                // This happens when the server-side generation takes longer than Netlify's timeout
                if (parsed.generation.status === 'generating' && parsed.generation.generationId) {
                  console.log('[ChatContext] Starting frontend poll for generation:', parsed.generation.generationId)
                  pollForGenerationComplete(
                    parsed.generation.generationId,
                    assistantMessageId,
                    parsed.generation.model,
                    parsed.generation.params
                  )
                }

                // Check for insufficient balance error
                if (parsed.generation.status === 'error' && parsed.generation.code === 'INSUFFICIENT_BALANCE') {
                  console.log('[ChatContext] Insufficient balance detected - triggering modal')
                  if (onInsufficientBalanceCallback) {
                    onInsufficientBalanceCallback(
                      parsed.generation.required || 0,
                      parsed.generation.available || 0,
                      parsed.generation.model
                    )
                  }
                }

                // When generation completes successfully, trigger refresh callback
                if (parsed.generation.status === 'complete' && onGenerationCompleteCallback) {
                  console.log('[ChatContext] Generation complete - calling refresh callback')
                  onGenerationCompleteCallback()
                }
              }
              if (parsed.skillCreation && onSkillCreationCallback && parsed.skillCreation.name) {
                // Trigger the skill creation callback only if valid data
                onSkillCreationCallback(parsed.skillCreation as SkillCreationData)
              }
              // Handle director's notes from AI
              if (parsed.directorsNotes) {
                updateMessage(assistantMessageId, {
                  directorsNotes: parsed.directorsNotes
                })
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
  }, [state.messages, addMessage, appendToMessage, updateMessage, updateGenerationStatus, pollForGenerationComplete, setLoading, setError, onSkillCreationCallback, onGenerationCompleteCallback, onInsufficientBalanceCallback, platformEnabled])

  // Check platform orchestration status on mount
  useEffect(() => {
    async function checkPlatformStatus() {
      try {
        const res = await fetch('/api/platform-status')
        if (res.ok) {
          const data = await res.json()
          setPlatformEnabled(data.platformOrchestrationEnabled)
        }
      } catch (err) {
        console.error('Failed to check platform status:', err)
      } finally {
        setPlatformLoading(false)
      }
    }
    checkPlatformStatus()
  }, [])

  // Load conversations from localStorage on mount
  useEffect(() => {
    const saved = loadFromStorage<Conversation[]>(STORAGE_KEYS.CONVERSATIONS)
    if (saved && saved.length > 0) {
      // Parse dates back from strings
      const parsed = saved.map(conv => ({
        ...conv,
        createdAt: new Date(conv.createdAt),
        updatedAt: new Date(conv.updatedAt),
        messages: conv.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
      }))
      dispatch({ type: 'LOAD_CONVERSATIONS', payload: parsed })
    }
  }, [])

  // Save conversations to localStorage when they change
  useEffect(() => {
    if (state.conversations.length > 0) {
      saveToStorage(STORAGE_KEYS.CONVERSATIONS, state.conversations)
    }
  }, [state.conversations])

  // Helper to generate title from first user message
  const generateTitle = (messages: ChatMessage[]): string => {
    const firstUserMessage = messages.find(m => m.role === 'user')
    if (firstUserMessage) {
      const title = firstUserMessage.content.slice(0, 50)
      return title.length < firstUserMessage.content.length ? `${title}...` : title
    }
    return 'New Chat'
  }

  // Track last saved message index to avoid re-saving messages
  const lastSavedIndexRef = useRef<Map<string, number>>(new Map())

  // Get auth headers helper
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (typeof window !== 'undefined') {
      const devToken = localStorage.getItem('whop-dev-token')
      const devUserId = localStorage.getItem('whop-dev-user-id')
      if (devToken) headers['x-whop-user-token'] = devToken
      if (devUserId) headers['x-whop-user-id'] = devUserId
    }
    return headers
  }, [])

  // Sync conversation to Supabase API
  // Returns the server-side UUID if successful
  const syncToSupabase = useCallback(async (localId: string, serverId: string | undefined, messages: ChatMessage[], title: string, isNew: boolean): Promise<string | null> => {
    try {
      const authHeaders = getAuthHeaders()

      if (isNew || !serverId) {
        // Create conversation in Supabase
        const createRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ title }),
        })

        if (createRes.ok) {
          const { conversation } = await createRes.json()
          if (conversation?.id) {
            const serverUUID = conversation.id
            console.log('[ChatContext] Created server conversation:', serverUUID)

            // Update local conversation with server ID
            dispatch({
              type: 'UPDATE_CONVERSATION',
              payload: { id: localId, updates: { serverId: serverUUID } },
            })

            // Save all messages to the new conversation
            for (const msg of messages) {
              if (msg.role === 'user' || (msg.role === 'assistant' && !msg.isStreaming)) {
                await fetch(`/api/conversations/${serverUUID}/messages`, {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify({
                    role: msg.role,
                    content: msg.content,
                  }),
                })
              }
            }
            lastSavedIndexRef.current.set(serverUUID, messages.length - 1)
            return serverUUID
          }
        }
      } else {
        // Use server ID for API calls (UUID format)
        const lastSavedIndex = lastSavedIndexRef.current.get(serverId) ?? -1

        // Only save new messages that haven't been saved yet
        for (let i = lastSavedIndex + 1; i < messages.length; i++) {
          const msg = messages[i]
          if (msg.role === 'user' || (msg.role === 'assistant' && !msg.isStreaming)) {
            await fetch(`/api/conversations/${serverId}/messages`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                role: msg.role,
                content: msg.content,
              }),
            })
            lastSavedIndexRef.current.set(serverId, i)
          }
        }
        return serverId
      }
    } catch (error) {
      // Silently fail for unauthenticated users - localStorage still works
      console.log('Supabase sync skipped (user may not be authenticated):', error)
    }
    return null
  }, [getAuthHeaders])

  // Strip large base64 data from messages before saving to localStorage
  // This prevents quota exceeded errors from image attachments
  const stripBase64FromMessages = (messages: ChatMessage[]): ChatMessage[] => {
    return messages.map(msg => ({
      ...msg,
      attachments: msg.attachments?.map(att => ({
        ...att,
        base64: undefined, // Remove base64 data
        file: undefined,   // Remove File objects (can't be serialized anyway)
      })),
    }))
  }

  // Save current conversation (auto-save when messages change)
  const saveCurrentConversation = useCallback(() => {
    if (state.messages.length === 0) return

    const now = new Date()
    const title = generateTitle(state.messages)

    // Strip base64 for localStorage storage (keeps URLs for reference)
    const messagesForStorage = stripBase64FromMessages(state.messages)

    if (state.currentConversationId) {
      // Find existing conversation to get serverId
      const existingConv = state.conversations.find(c => c.id === state.currentConversationId)
      const serverId = existingConv?.serverId

      // Update existing conversation locally (without base64)
      dispatch({
        type: 'UPDATE_CONVERSATION',
        payload: {
          id: state.currentConversationId,
          updates: {
            messages: messagesForStorage,
            updatedAt: now,
            title,
          },
        },
      })

      // Sync to Supabase (for authenticated users) - uses serverId (UUID)
      syncToSupabase(state.currentConversationId, serverId, state.messages, title, false)
    } else {
      // Create new conversation locally
      const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newConversation: Conversation = {
        id,
        title,
        messages: messagesForStorage, // Store without base64
        createdAt: now,
        updatedAt: now,
      }
      dispatch({ type: 'ADD_CONVERSATION', payload: newConversation })
      dispatch({ type: 'SET_CONVERSATION_ID', payload: id })

      // Sync to Supabase (for authenticated users) - will get serverId back
      syncToSupabase(id, undefined, state.messages, title, true)
    }
  }, [state.messages, state.currentConversationId, state.conversations, syncToSupabase])

  // Use ref to avoid circular dependency in auto-save effect
  const saveConversationRef = useRef(saveCurrentConversation)
  saveConversationRef.current = saveCurrentConversation

  // Auto-save when messages change (after at least one user message)
  // Use debounce to prevent rapid re-saves
  const lastSaveTimeRef = useRef<number>(0)
  useEffect(() => {
    const hasUserMessage = state.messages.some(m => m.role === 'user')
    const hasCompletedMessage = state.messages.some(m => m.role === 'assistant' && !m.isStreaming)
    const now = Date.now()

    // Only save if conditions met and at least 1 second since last save
    if (hasUserMessage && hasCompletedMessage && !state.isLoading && now - lastSaveTimeRef.current > 1000) {
      lastSaveTimeRef.current = now
      saveConversationRef.current()
    }
  }, [state.messages, state.isLoading])

  // Create a new conversation
  const createNewConversation = useCallback(() => {
    // Save current conversation first if there are messages
    if (state.messages.length > 0 && !state.currentConversationId) {
      saveCurrentConversation()
    }
    // Clear current conversation
    dispatch({ type: 'CLEAR_MESSAGES' })
    dispatch({ type: 'SET_CONVERSATION_ID', payload: null })
  }, [state.messages, state.currentConversationId, saveCurrentConversation])

  // Switch to a different conversation
  const switchConversation = useCallback((id: string) => {
    const conversation = state.conversations.find(c => c.id === id)
    if (conversation) {
      dispatch({
        type: 'SWITCH_CONVERSATION',
        payload: { conversationId: id, messages: conversation.messages },
      })
    }
  }, [state.conversations])

  // Delete a conversation
  const deleteConversation = useCallback((id: string) => {
    dispatch({ type: 'DELETE_CONVERSATION', payload: id })
    // Update localStorage
    const remaining = state.conversations.filter(c => c.id !== id)
    if (remaining.length === 0) {
      localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS)
    }
  }, [state.conversations])

  // Rename a conversation
  const renameConversation = useCallback((id: string, title: string) => {
    dispatch({
      type: 'UPDATE_CONVERSATION',
      payload: { id, updates: { title, updatedAt: new Date() } },
    })
  }, [])

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
    createNewConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
    saveCurrentConversation,
    onSkillCreation: onSkillCreationCallback,
    setOnSkillCreation: setOnSkillCreationCallback,
    onGenerationComplete: onGenerationCompleteCallback,
    setOnGenerationComplete: setOnGenerationCompleteCallback,
    onInsufficientBalance: onInsufficientBalanceCallback,
    setOnInsufficientBalance: setOnInsufficientBalanceCallback,
    platformEnabled,
    platformLoading,
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
