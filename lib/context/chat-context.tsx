'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect, useState, useRef } from 'react'
import { getApiSettings } from '@/lib/api-settings'
import { fileToBase64 } from '@/lib/image-utils'
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from '@/lib/storage'

// Types
export type ImagePurpose = 'reference' | 'starting_frame' | 'edit_target' | 'last_frame'

export const IMAGE_PURPOSE_LABELS: Record<ImagePurpose, string> = {
  reference: 'Reference',
  starting_frame: 'Start Frame',
  edit_target: 'Edit',
  last_frame: 'End Frame',
}

export const IMAGE_PURPOSE_DESCRIPTIONS: Record<ImagePurpose, string> = {
  reference: 'Style or content reference (ingredients)',
  starting_frame: 'First frame for video generation',
  edit_target: 'Image to modify or edit',
  last_frame: 'End frame for video (Veo)',
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

// Conversation type for chat history
export interface Conversation {
  id: string
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

  const sendMessage = useCallback(async (content: string, attachments?: ChatAttachment[], skillsContext?: string, referencedSkills?: SkillForApi[], selectedGenerationModelId?: string) => {
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
            purpose: a.purpose,  // Include purpose for generation API
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
                updateGenerationStatus(assistantMessageId, parsed.generation)
                // When generation completes successfully, trigger refresh callback
                if (parsed.generation.status === 'complete' && onGenerationCompleteCallback) {
                  onGenerationCompleteCallback()
                }
              }
              if (parsed.skillCreation && onSkillCreationCallback && parsed.skillCreation.name) {
                // Trigger the skill creation callback only if valid data
                onSkillCreationCallback(parsed.skillCreation as SkillCreationData)
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
  }, [state.messages, addMessage, appendToMessage, updateMessage, updateGenerationStatus, setLoading, setError, onSkillCreationCallback, onGenerationCompleteCallback])

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

  // Sync conversation to Supabase API
  const syncToSupabase = useCallback(async (conversationId: string, messages: ChatMessage[], title: string, isNew: boolean) => {
    try {
      if (isNew) {
        // Create conversation in Supabase
        const createRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })

        if (createRes.ok) {
          const { conversation } = await createRes.json()
          if (conversation?.id) {
            // Save all messages to the new conversation
            for (const msg of messages) {
              if (msg.role === 'user' || (msg.role === 'assistant' && !msg.isStreaming)) {
                await fetch(`/api/conversations/${conversation.id}/messages`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role: msg.role,
                    content: msg.content,
                  }),
                })
              }
            }
            lastSavedIndexRef.current.set(conversation.id, messages.length - 1)
            return conversation.id
          }
        }
      } else {
        // Get last saved index for this conversation
        const lastSavedIndex = lastSavedIndexRef.current.get(conversationId) ?? -1

        // Only save new messages that haven't been saved yet
        for (let i = lastSavedIndex + 1; i < messages.length; i++) {
          const msg = messages[i]
          if (msg.role === 'user' || (msg.role === 'assistant' && !msg.isStreaming)) {
            await fetch(`/api/conversations/${conversationId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: msg.role,
                content: msg.content,
              }),
            })
            lastSavedIndexRef.current.set(conversationId, i)
          }
        }
      }
    } catch (error) {
      // Silently fail for unauthenticated users - localStorage still works
      console.log('Supabase sync skipped (user may not be authenticated):', error)
    }
    return null
  }, [])

  // Save current conversation (auto-save when messages change)
  const saveCurrentConversation = useCallback(() => {
    if (state.messages.length === 0) return

    const now = new Date()
    const title = generateTitle(state.messages)

    if (state.currentConversationId) {
      // Update existing conversation locally
      dispatch({
        type: 'UPDATE_CONVERSATION',
        payload: {
          id: state.currentConversationId,
          updates: {
            messages: state.messages,
            updatedAt: now,
            title,
          },
        },
      })

      // Sync to Supabase (for authenticated users)
      syncToSupabase(state.currentConversationId, state.messages, title, false)
    } else {
      // Create new conversation locally
      const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const newConversation: Conversation = {
        id,
        title,
        messages: state.messages,
        createdAt: now,
        updatedAt: now,
      }
      dispatch({ type: 'ADD_CONVERSATION', payload: newConversation })
      dispatch({ type: 'SET_CONVERSATION_ID', payload: id })

      // Sync to Supabase (for authenticated users)
      syncToSupabase(id, state.messages, title, true)
    }
  }, [state.messages, state.currentConversationId, syncToSupabase])

  // Auto-save when messages change (after at least one user message)
  useEffect(() => {
    const hasUserMessage = state.messages.some(m => m.role === 'user')
    const hasCompletedMessage = state.messages.some(m => m.role === 'assistant' && !m.isStreaming)
    if (hasUserMessage && hasCompletedMessage && !state.isLoading) {
      saveCurrentConversation()
    }
  }, [state.messages, state.isLoading, saveCurrentConversation])

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
