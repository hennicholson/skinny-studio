'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layers,
  CheckCircle2,
  Circle,
  Loader2,
  SkipForward,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Send,
  Sparkles,
  Image as ImageIcon,
  Package,
  Music,
  Target,
  Smartphone,
  Paperclip,
  X,
  Wallet,
  LucideIcon,
  Zap,
  Play,
  Pencil,
  Check,
  RefreshCw,
  Plus,
  Lightbulb,
  LayoutGrid,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { useSessions } from '@/lib/context/sessions-context'
import { useUser } from '@/lib/context/user-context'
import { useSkills } from '@/lib/context/skills-context'
import { sessionTypeConfig, SessionAsset, mockModels } from '@/lib/types'
import { getSessionTemplate } from '@/lib/sessions/session-templates'
import { MODEL_SPECS } from '@/lib/orchestrator/model-specs'
import { ImageSourcePicker } from '@/components/chat/image-source-picker'
import { ChatAttachment } from '@/lib/context/chat-context'
import { SessionCompleteView } from './session-complete-view'
import { SessionBoardView } from './session-board-view'
import { toast } from 'sonner'

// Get image and video models for the model selector
const imageModels = mockModels.filter(m => m.category === 'image')
const videoModels = mockModels.filter(m => m.category === 'video')

// Helper to get supported aspect ratios for a model from MODEL_SPECS
function getModelAspectRatios(modelId: string): string[] {
  const spec = MODEL_SPECS.find(m => m.id === modelId)
  const aspectRatioParam = spec?.params.optional?.find(p => p.name === 'aspect_ratio')
  return aspectRatioParam?.options || ['1:1', '16:9', '9:16']
}

// Validate and find fallback aspect ratio if the desired one isn't supported
function validateAspectRatio(modelId: string, desiredRatio: string): string {
  const supported = getModelAspectRatios(modelId)
  if (supported.includes(desiredRatio)) return desiredRatio
  // Fallback to 1:1 if desired ratio not supported, otherwise first option
  return supported.includes('1:1') ? '1:1' : supported[0]
}

// Map icon names to lucide components
const iconMap: Record<string, LucideIcon> = {
  Package,
  Music,
  Target,
  Smartphone,
}

function getIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Package
}

interface Attachment extends ChatAttachment {
  file?: File
}

interface GenerationStatus {
  status: 'planning' | 'generating' | 'complete' | 'error'
  model?: string
  url?: string
  error?: string
}

interface DirectorsNotes {
  modelChoice?: string
  promptEnhancements?: string
  parameterReasoning?: string
  tips?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
  generation?: GenerationStatus
  attachments?: Attachment[]
  directorsNotes?: DirectorsNotes
}

// Parse director's notes from message content
function parseDirectorsNotes(text: string): DirectorsNotes | null {
  const regex = /```directors-notes\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)
  if (!match) return null

  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

// Strip special blocks from display content
function stripSpecialBlocks(text: string): string {
  return text
    .replace(/```directors-notes[\s\S]*?```/g, '')
    .replace(/```generate[\s\S]*?```/g, '')
    .trim()
}

// Director's Notes Display Component
function DirectorsNotesDisplay({ notes }: { notes: DirectorsNotes }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!notes || (!notes.modelChoice && !notes.promptEnhancements && !notes.tips)) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-white/40 hover:text-skinny-yellow transition-colors group"
      >
        <Lightbulb size={12} className="group-hover:text-skinny-yellow" />
        <span>Director's Notes</span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 p-3 rounded-xl bg-skinny-yellow/[0.03] border border-skinny-yellow/10"
          >
            <div className="space-y-2.5">
              {notes.modelChoice && (
                <div>
                  <span className="text-[10px] text-skinny-yellow/70 uppercase tracking-wide font-medium">Model Choice</span>
                  <p className="text-xs text-white/60 mt-0.5">{notes.modelChoice}</p>
                </div>
              )}
              {notes.promptEnhancements && (
                <div>
                  <span className="text-[10px] text-skinny-yellow/70 uppercase tracking-wide font-medium">What I Added</span>
                  <p className="text-xs text-white/60 mt-0.5">{notes.promptEnhancements}</p>
                </div>
              )}
              {notes.parameterReasoning && (
                <div>
                  <span className="text-[10px] text-skinny-yellow/70 uppercase tracking-wide font-medium">Settings</span>
                  <p className="text-xs text-white/60 mt-0.5">{notes.parameterReasoning}</p>
                </div>
              )}
              {notes.tips && (
                <div className="pt-2 border-t border-skinny-yellow/10">
                  <span className="text-[10px] text-skinny-yellow/70 uppercase tracking-wide font-medium">Tips</span>
                  <p className="text-xs text-skinny-yellow/80 mt-0.5">{notes.tips}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

interface SessionViewProps {
  onBack?: () => void
}

/**
 * Session View
 *
 * Main view for an active session with:
 * - Left: Asset checklist with status indicators
 * - Center: Chat interface for AI guidance
 * - Top: Progress bar and session info
 */
export function SessionView({ onBack }: SessionViewProps) {
  const {
    currentSession,
    getSessionProgress,
    getNextPendingAsset,
    getAssetTemplate,
    skipAsset,
    markAssetCompleted,
    updateSession,
    isGenerating,
  } = useSessions()

  const { whop, balanceDollars, refreshUser } = useUser()
  const { getSkillsContext, parseSkillReferences } = useSkills()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<SessionAsset | null>(null)
  const [showAssetPanel, setShowAssetPanel] = useState(true)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [validatedAspectRatio, setValidatedAspectRatio] = useState<string>('1:1')
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [viewMode, setViewMode] = useState<'chat' | 'board'>('chat')
  const [currentGeneration, setCurrentGeneration] = useState<GenerationStatus | null>(null)
  // Pending approval state - holds generation result waiting for user approval
  const [pendingApproval, setPendingApproval] = useState<{
    assetId: string
    imageUrl: string
    prompt: string
    model: string
  } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelSelectorRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentGeneration])

  // Clear attachments when switching sessions to prevent stale references
  useEffect(() => {
    setAttachments([])
  }, [currentSession?.id])

  // Poll for generation completion (for async generations)
  const pollForGeneration = useCallback(async (generationId: string, model: string) => {
    const pollInterval = 2000 // 2 seconds
    const maxAttempts = 60 // 2 minutes max

    // Build headers for auth
    const headers: Record<string, string> = {}
    if (typeof window !== 'undefined') {
      const devToken = localStorage.getItem('whop-dev-token')
      const devUserId = localStorage.getItem('whop-dev-user-id')
      if (devToken) headers['x-whop-user-token'] = devToken
      if (devUserId) headers['x-whop-user-id'] = devUserId
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`/api/generations/${generationId}`, { headers })
        if (!response.ok) {
          throw new Error('Failed to check generation status')
        }

        const data = await response.json()

        if (data.replicate_status === 'succeeded' && data.output_urls?.length > 0) {
          // Get the first output URL
          const imageUrl = data.output_urls[0]
          setCurrentGeneration(null)

          // Get the next pending asset - DON'T auto-complete, set pending approval instead
          const nextAsset = getNextPendingAsset()
          if (nextAsset && imageUrl) {
            // Set pending approval - user must accept, regenerate, or skip
            setPendingApproval({
              assetId: nextAsset.id,
              imageUrl,
              prompt: data.prompt || 'Generated image',
              model
            })
          }
          return
        } else if (data.replicate_status === 'failed' || data.replicate_status === 'canceled') {
          setCurrentGeneration(null)
          toast.error(data.replicate_error || 'Generation failed')
          return
        }

        // Still processing, wait and try again
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error) {
        console.error('Polling error:', error)
      }
    }

    // Timeout
    setCurrentGeneration(null)
    toast.error('Generation timed out')
  }, [getNextPendingAsset])

  // Build session system context
  const buildSessionContext = useCallback(() => {
    if (!currentSession) return ''

    const template = getSessionTemplate(currentSession.templateId)
    const progress = getSessionProgress()
    const nextAsset = getNextPendingAsset()
    const nextTemplate = nextAsset ? getAssetTemplate(nextAsset) : null

    return `## SESSION MODE ACTIVE
You are Skinny, a creative AI assistant helping with a ${template?.name || 'creative'} session.

Project: "${currentSession.title}"
${currentSession.briefContext ? `
Creative Brief:
- Vibe: ${currentSession.briefContext.vibe || 'Not specified'}
- Platform: ${currentSession.briefContext.platform || 'Not specified'}
- Style: ${currentSession.briefContext.style || 'Not specified'}
- Output Type: ${currentSession.briefContext.outputType || 'Not specified'}
` : ''}

Progress: ${progress.completed}/${progress.total} assets (${progress.requiredCompleted}/${progress.required} required)

### Current Asset
${nextAsset && nextTemplate ? `
Working on: ${nextTemplate.name}
- Description: ${nextTemplate.description}
- Aspect Ratio: ${nextTemplate.aspectRatio}
- Model: ${selectedModelId || nextTemplate.modelSuggestion}
- Recommended Skills: ${nextTemplate.skills.join(', ')}
` : 'All assets complete!'}

### Remaining Assets
${currentSession.assets
  .filter(a => a.status === 'pending')
  .map(a => {
    const t = template?.assets.find(ta => ta.id === a.templateAssetId)
    return t ? `- ${t.name} (${t.aspectRatio})` : ''
  })
  .filter(Boolean)
  .join('\n')}

## YOUR TASK
Guide the user through creating this asset. Be conversational and helpful.

When the user describes what they want:
1. If their description is vague, ask ONE quick clarifying question
2. When you have a clear vision, FIRST show the user your plan before generating

## CONFIRMATION FLOW (IMPORTANT!)
Before generating ANYTHING, you MUST:
1. Summarize what you'll create in 1-2 sentences
2. Show the refined prompt you'll use (in quotes)
3. Show estimated cost: ~$0.03-0.05 for standard, ~$0.08-0.15 for premium models
4. Ask: "Ready to generate?"

Example confirmation message:
"I'll create a bold product shot with dramatic lighting and your brand colors.

**Prompt:** "A sleek product bottle on a marble surface, dramatic side lighting, deep shadows, luxury aesthetic, 4K product photography"

**Model:** ${selectedModelId || nextTemplate?.modelSuggestion || 'seedream-4.5'} (~$0.04)

Ready to generate? 🎨"

## GENERATION RULES
- Do NOT output the generate block until user explicitly says "yes", "go", "generate", "do it", "create it", etc.
- If user says "no" or wants changes, refine the prompt and ask again
- NEVER auto-generate without user confirmation

## GENERATION FORMAT
ONLY after user confirms, output this exact format:

\`\`\`generate
{
  "model": "${selectedModelId || nextTemplate?.modelSuggestion || 'seedream-4.5'}",
  "prompt": "Your detailed, creative prompt based on user's description",
  "params": {
    "aspect_ratio": "${validatedAspectRatio || nextTemplate?.aspectRatio || '1:1'}"
  }
}
\`\`\`

IMPORTANT:
- Use model "${selectedModelId || nextTemplate?.modelSuggestion || 'seedream-4.5'}"
- Use aspect ratio "${validatedAspectRatio || nextTemplate?.aspectRatio || '1:1'}"
- Make prompts detailed with style, lighting, composition
- WAIT for explicit user approval before generating
- Don't show the generate block to user - just describe what you're creating

## AVAILABLE SKILLS
Users can reference skills using @shortcut syntax. Here are the available skills:
${getSkillsContext() || 'No skills available'}

When a user references a skill like @product or @lifestyle, apply that skill's style and techniques to the generation.`
  }, [currentSession, getSessionProgress, getNextPendingAsset, getAssetTemplate, selectedModelId, validatedAspectRatio, getSkillsContext])

  // Load saved messages or show initial greeting when session is loaded
  useEffect(() => {
    if (currentSession && messages.length === 0) {
      // Check if session has saved messages
      if (currentSession.messages && currentSession.messages.length > 0) {
        // Restore saved messages with proper type mapping
        setMessages(currentSession.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
          generation: m.generation,
          // Map saved attachments to full Attachment type
          attachments: m.attachments?.map(a => ({
            id: a.url, // Use URL as ID if not stored
            name: a.type || 'attachment',
            type: (a.type === 'image' || a.type === 'reference' ? a.type : 'image') as 'image' | 'reference',
            url: a.url,
          })),
        })))
      } else {
        // Show welcome message for new session
        const template = getSessionTemplate(currentSession.templateId)
        const progress = getSessionProgress()
        const nextAsset = getNextPendingAsset()
        const nextTemplate = nextAsset ? getAssetTemplate(nextAsset) : null

        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: `Hey! Let's create some amazing content for "${currentSession.title}"! 🎨

${currentSession.briefContext?.vibe ? `Love the "${currentSession.briefContext.vibe}" vibe` : 'Let\'s make something great'}${currentSession.briefContext?.platform ? ` for ${currentSession.briefContext.platform}` : ''}.

You've got **${progress.total} assets** to create (${progress.required} required).${
  nextAsset && nextTemplate
    ? `\n\n**First up: ${nextTemplate.name}**\n${nextTemplate.description}\n\nWhat do you want to create?`
    : ''
}`,
          createdAt: new Date(),
        }])
      }
    }
  }, [currentSession, getSessionProgress, getNextPendingAsset, getAssetTemplate])

  // Save messages to session whenever they change (debounced)
  useEffect(() => {
    if (!currentSession || messages.length === 0) return

    // Debounce saving to avoid too many API calls
    const timeoutId = setTimeout(() => {
      const messagesToSave = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        // Map attachments to simpler storage format
        attachments: m.attachments?.map(a => ({
          url: a.url,
          type: a.type,
          name: a.name,
        })),
        generation: m.generation,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      }))
      updateSession(currentSession.id, { messages: messagesToSave })
    }, 1000) // Save 1 second after last change

    return () => clearTimeout(timeoutId)
  }, [messages, currentSession, updateSession])

  // Auto-select the next pending asset
  useEffect(() => {
    if (!selectedAsset || selectedAsset.status !== 'pending') {
      const next = getNextPendingAsset()
      if (next) setSelectedAsset(next)
    }
  }, [selectedAsset, getNextPendingAsset, currentSession?.assets])

  // Initialize model selection based on asset template with validation
  useEffect(() => {
    if (selectedAsset) {
      const tpl = getAssetTemplate(selectedAsset)
      if (tpl?.modelSuggestion) {
        // Check if the suggested model exists
        const allModels = [...imageModels, ...videoModels]
        const modelExists = allModels.some(m => m.id === tpl.modelSuggestion)

        if (modelExists) {
          setSelectedModelId(tpl.modelSuggestion)
          // Validate and set the aspect ratio
          const validRatio = validateAspectRatio(tpl.modelSuggestion, tpl.aspectRatio || '1:1')
          setValidatedAspectRatio(validRatio)
        } else {
          // Fallback to first available model based on media type
          const fallback = tpl.mediaType === 'video' ? videoModels[0] : imageModels[0]
          if (fallback) {
            setSelectedModelId(fallback.id)
            const validRatio = validateAspectRatio(fallback.id, tpl.aspectRatio || '1:1')
            setValidatedAspectRatio(validRatio)
          }
        }
      }
    }
  }, [selectedAsset, getAssetTemplate])

  // Close model selector on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setShowModelSelector(false)
      }
    }
    if (showModelSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showModelSelector])

  // Update session status when starting work
  useEffect(() => {
    if (currentSession?.status === 'planning' && messages.length > 1) {
      updateSession(currentSession.id, { status: 'in_progress' })
    }
  }, [currentSession, messages.length, updateSession])

  const handleSend = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading || !currentSession) return

    const nextAsset = getNextPendingAsset()
    const nextTemplate = nextAsset ? getAssetTemplate(nextAsset) : null

    // Save current attachments and clear them
    const currentAttachments = [...attachments]
    setAttachments([])

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim() || (currentAttachments.length > 0 ? '[Image attached]' : ''),
      createdAt: new Date(),
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Create placeholder assistant message
    const assistantMessageId = `assistant-${Date.now()}`
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    }])

    try {
      // Build full conversation history for API
      const sessionContext = buildSessionContext()

      // Convert messages to API format with full history
      // Skip system messages and ensure first message is from user (Gemini requirement)
      const filteredMessages = messages.filter(m => m.role !== 'system')
      const firstUserIdx = filteredMessages.findIndex(m => m.role === 'user')
      const relevantMessages = firstUserIdx >= 0 ? filteredMessages.slice(firstUserIdx) : []

      const apiMessages = relevantMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        attachments: m.attachments?.map(a => ({
          type: a.type,
          url: a.url,
          name: a.name,
          base64: a.base64,
          mimeType: a.mimeType,
        })),
      }))

      // Add the new user message
      const processedAttachments = await Promise.all(currentAttachments.map(async (a) => {
        if (a.file) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const result = reader.result as string
              resolve(result.split(',')[1])
            }
            reader.readAsDataURL(a.file!)
          })
          return { type: 'image' as const, url: a.url, name: a.name, base64, mimeType: a.file.type }
        }
        return { type: a.type, url: a.url, name: a.name, base64: a.base64, mimeType: a.mimeType }
      }))

      apiMessages.push({
        role: 'user',
        content: userMessage.content,
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
      })

      // Build headers
      const chatHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) chatHeaders['x-whop-user-token'] = devToken
        if (devUserId) chatHeaders['x-whop-user-id'] = devUserId
      }

      // Call the chat API with session context injected
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: chatHeaders,
        body: JSON.stringify({
          messages: apiMessages,
          modelId: 'gemini-2.5-flash',
          selectedGenerationModelId: selectedModelId || nextTemplate?.modelSuggestion || 'seedream-4.5',
          aspectRatio: nextTemplate?.aspectRatio || '1:1',
          sessionContext, // Inject session context for system prompt
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      // Parse SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantContent = ''
      let generationResult: GenerationStatus | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)

              // Handle content streaming
              if (parsed.content) {
                assistantContent += parsed.content
                // Update message in real-time (strip generation blocks from display)
                const displayContent = assistantContent.replace(/```generate[\s\S]*?```/g, '').trim()
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId ? { ...m, content: displayContent } : m
                ))
              }

              // Handle generation status
              if (parsed.generation) {
                const gen = parsed.generation
                if (gen.status === 'planning') {
                  setCurrentGeneration({ status: 'planning', model: gen.model })
                } else if (gen.status === 'generating') {
                  setCurrentGeneration({ status: 'generating', model: gen.model })
                  // Check if we have a generationId for polling
                  if (gen.generationId) {
                    // Start polling for generation completion
                    pollForGeneration(gen.generationId, gen.model)
                  }
                } else if (gen.status === 'complete') {
                  // URL can be in result.imageUrl (from generate API) or url (direct)
                  const imageUrl = gen.result?.imageUrl || gen.url
                  if (imageUrl) {
                    generationResult = { status: 'complete', url: imageUrl, model: gen.model }
                    setCurrentGeneration(null)
                  }
                } else if (gen.status === 'error') {
                  generationResult = { status: 'error', error: gen.error }
                  setCurrentGeneration(null)
                  toast.error(gen.error || 'Generation failed')
                }
              }

              if (parsed.error) {
                throw new Error(parsed.error)
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      // Update final message with generation result
      setMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? {
              ...m,
              content: assistantContent.replace(/```generate[\s\S]*?```/g, '').trim() || 'Creating your image...',
              generation: generationResult || undefined
            }
          : m
      ))

      // If we got a generation URL, set pending approval (user must accept before moving on)
      // Charging already happened in /api/generate - approval is just for workflow control
      if (generationResult?.url && nextAsset) {
        setPendingApproval({
          assetId: nextAsset.id,
          imageUrl: generationResult.url,
          prompt: 'Generated image',
          model: generationResult.model || selectedModelId || 'unknown'
        })
      }

    } catch (error) {
      console.error('Chat error:', error)
      toast.error('Failed to send message')
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId))
      setCurrentGeneration(null)
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, currentSession, messages, attachments, selectedModelId, buildSessionContext, getNextPendingAsset, getAssetTemplate, pollForGeneration])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSkipAsset = (asset: SessionAsset) => {
    skipAsset(asset.id)
    const nextAsset = getNextPendingAsset()
    setSelectedAsset(nextAsset)

    if (nextAsset) {
      const nextTemplate = getAssetTemplate(nextAsset)
      if (nextTemplate) {
        setMessages(prev => [...prev, {
          id: `system-${Date.now()}`,
          role: 'assistant',
          content: `No problem! Let's move on to **${nextTemplate.name}** - ${nextTemplate.description}\n\nWhat would you like for this ${nextTemplate.aspectRatio} asset?`,
          createdAt: new Date(),
        }])
      }
    }
  }

  const getStatusIcon = (status: SessionAsset['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={16} className="text-green-400" />
      case 'generating':
        return <Loader2 size={16} className="text-skinny-yellow animate-spin" />
      case 'skipped':
        return <SkipForward size={16} className="text-white/30" />
      default:
        return <Circle size={16} className="text-white/30" />
    }
  }

  // Helper to detect if a message is a confirmation message (asking "Ready to generate?")
  const isConfirmationMessage = useCallback((message: Message): boolean => {
    if (message.role !== 'assistant') return false
    const text = message.content.toLowerCase()
    return (
      text.includes('ready to generate') ||
      text.includes('shall i create') ||
      text.includes('want me to generate') ||
      text.includes('shall i generate') ||
      (text.includes('**prompt:**') && (text.includes('**model:**') || text.includes('(~$')))
    )
  }, [])

  // Check if this is the last message (for showing confirmation buttons)
  const getLastAssistantMessageId = useCallback((): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        return messages[i].id
      }
    }
    return null
  }, [messages])

  // Send a specific message (used by confirmation buttons)
  const handleSendWithMessage = useCallback(async (messageContent: string) => {
    if (isLoading || !currentSession) return

    const nextAsset = getNextPendingAsset()
    const nextTemplate = nextAsset ? getAssetTemplate(nextAsset) : null

    // Save current attachments and clear them
    const currentAttachments = [...attachments]
    setAttachments([])

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageContent,
      createdAt: new Date(),
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    // Create placeholder assistant message
    const assistantMessageId = `assistant-${Date.now()}`
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    }])

    try {
      // Build full conversation history for API
      const sessionContext = buildSessionContext()

      // Convert messages to API format with full history
      const filteredMessages = messages.filter(m => m.role !== 'system')
      const firstUserIdx = filteredMessages.findIndex(m => m.role === 'user')
      const relevantMessages = firstUserIdx >= 0 ? filteredMessages.slice(firstUserIdx) : []

      const apiMessages = relevantMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        attachments: m.attachments?.map(a => ({
          type: a.type,
          url: a.url,
          name: a.name,
          base64: a.base64,
          mimeType: a.mimeType,
        })),
      }))

      // Add the new user message
      const processedAttachments = await Promise.all(currentAttachments.map(async (a) => {
        if (a.file) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const result = reader.result as string
              resolve(result.split(',')[1])
            }
            reader.readAsDataURL(a.file!)
          })
          return { type: 'image' as const, url: a.url, name: a.name, base64, mimeType: a.file.type }
        }
        return { type: a.type, url: a.url, name: a.name, base64: a.base64, mimeType: a.mimeType }
      }))

      apiMessages.push({
        role: 'user',
        content: messageContent,
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
      })

      // Build headers
      const chatHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) chatHeaders['x-whop-user-token'] = devToken
        if (devUserId) chatHeaders['x-whop-user-id'] = devUserId
      }

      // Call the chat API with session context injected
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: chatHeaders,
        body: JSON.stringify({
          messages: apiMessages,
          modelId: 'gemini-2.5-flash',
          selectedGenerationModelId: selectedModelId || nextTemplate?.modelSuggestion || 'seedream-4.5',
          aspectRatio: nextTemplate?.aspectRatio || '1:1',
          sessionContext,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      // Parse SSE stream (same as handleSend)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantContent = ''
      let generationResult: GenerationStatus | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)

              if (parsed.content) {
                assistantContent += parsed.content
                const displayContent = assistantContent.replace(/```generate[\s\S]*?```/g, '').trim()
                setMessages(prev => prev.map(m =>
                  m.id === assistantMessageId ? { ...m, content: displayContent } : m
                ))
              }

              if (parsed.generation) {
                const gen = parsed.generation
                if (gen.status === 'planning') {
                  setCurrentGeneration({ status: 'planning', model: gen.model })
                } else if (gen.status === 'generating') {
                  setCurrentGeneration({ status: 'generating', model: gen.model })
                  if (gen.generationId) {
                    pollForGeneration(gen.generationId, gen.model)
                  }
                } else if (gen.status === 'complete') {
                  const imageUrl = gen.result?.imageUrl || gen.url
                  if (imageUrl) {
                    generationResult = { status: 'complete', url: imageUrl, model: gen.model }
                    setCurrentGeneration(null)
                  }
                } else if (gen.status === 'error') {
                  generationResult = { status: 'error', error: gen.error }
                  setCurrentGeneration(null)
                  toast.error(gen.error || 'Generation failed')
                }
              }

              if (parsed.error) {
                throw new Error(parsed.error)
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      // Update final message with generation result
      setMessages(prev => prev.map(m =>
        m.id === assistantMessageId
          ? {
              ...m,
              content: assistantContent.replace(/```generate[\s\S]*?```/g, '').trim() || 'Creating your image...',
              generation: generationResult || undefined
            }
          : m
      ))

      // If we got a generation URL, set pending approval (don't auto-complete)
      if (generationResult?.url && nextAsset) {
        setPendingApproval({
          assetId: nextAsset.id,
          imageUrl: generationResult.url,
          prompt: 'Generated image',
          model: generationResult.model || selectedModelId || 'unknown'
        })
      }

    } catch (error) {
      console.error('Chat error:', error)
      toast.error('Failed to send message')
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId))
      setCurrentGeneration(null)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, currentSession, messages, attachments, selectedModelId, buildSessionContext, getNextPendingAsset, getAssetTemplate, markAssetCompleted, refreshUser, pollForGeneration])

  // Handle user clicking "Generate" button
  const handleConfirmGenerate = useCallback(() => {
    handleSendWithMessage('Yes, generate it!')
  }, [handleSendWithMessage])

  // Handle user clicking "Edit" button
  const handleEditPrompt = useCallback(() => {
    // Focus the input and add a helpful message
    setInput('I want to change: ')
    // Focus the textarea
    const textarea = document.querySelector('textarea')
    if (textarea) {
      textarea.focus()
    }
  }, [])

  // Handle Accept - User approves the generated image
  const handleApproveGeneration = useCallback(() => {
    if (!pendingApproval) return

    const { assetId, imageUrl, model } = pendingApproval
    const foundAsset = currentSession?.assets.find(a => a.id === assetId)
    const assetTemplate = foundAsset ? getAssetTemplate(foundAsset) : undefined

    // Mark asset as completed
    markAssetCompleted(assetId, imageUrl)
    toast.success(`${assetTemplate?.name || 'Asset'} approved!`)
    refreshUser()

    // Clear pending approval
    setPendingApproval(null)

    // Check for next asset and add follow-up message
    const newNextAsset = getNextPendingAsset()
    if (newNextAsset) {
      const newNextTemplate = getAssetTemplate(newNextAsset)
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: `Nice! That looks great!\n\n**Next up: ${newNextTemplate?.name}**\n${newNextTemplate?.description}\n\nWhat do you want for this one?`,
        createdAt: new Date(),
        generation: { status: 'complete', url: imageUrl, model }
      }])
    } else {
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: `Awesome! All assets completed! Your session is ready.`,
        createdAt: new Date(),
        generation: { status: 'complete', url: imageUrl, model }
      }])
    }
  }, [pendingApproval, currentSession, getAssetTemplate, markAssetCompleted, refreshUser, getNextPendingAsset])

  // Handle Regenerate - User wants to try again with different output
  const handleRegenerateGeneration = useCallback(() => {
    if (!pendingApproval) return

    // Clear pending approval
    setPendingApproval(null)

    // Add message asking what to change
    setMessages(prev => [...prev, {
      id: `system-${Date.now()}`,
      role: 'assistant',
      content: `No problem! What would you like to change? I can adjust the style, composition, or try a completely different approach.`,
      createdAt: new Date(),
    }])
  }, [pendingApproval])

  // Handle Skip - User skips this asset
  const handleSkipPendingApproval = useCallback(() => {
    if (!pendingApproval) return

    const { assetId } = pendingApproval
    const foundAsset = currentSession?.assets.find(a => a.id === assetId)
    const assetTemplate = foundAsset ? getAssetTemplate(foundAsset) : undefined

    // Skip the asset
    skipAsset(assetId)

    // Clear pending approval
    setPendingApproval(null)

    // Check for next asset
    const newNextAsset = getNextPendingAsset()
    if (newNextAsset) {
      const newNextTemplate = getAssetTemplate(newNextAsset)
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: `Skipped ${assetTemplate?.name || 'asset'}. No problem!\n\n**Next up: ${newNextTemplate?.name}**\n${newNextTemplate?.description}\n\nWhat do you want for this one?`,
        createdAt: new Date(),
      }])
    } else {
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: `Skipped. You've gone through all the assets! Check out your gallery.`,
        createdAt: new Date(),
      }])
    }
  }, [pendingApproval, currentSession, getAssetTemplate, skipAsset, getNextPendingAsset])

  // Handle file upload from local
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        setAttachments(prev => [...prev, {
          id: `local-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          type: 'image',
          url,
          name: file.name,
          file,
        }])
      }
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSelectImage = (attachment: ChatAttachment) => {
    setAttachments(prev => [...prev, attachment as Attachment])
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id)
      if (attachment?.type === 'image' && attachment.url.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.url)
      }
      return prev.filter(a => a.id !== id)
    })
  }

  if (!currentSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/50">
        <p>No session selected</p>
      </div>
    )
  }

  // Show gallery view for completed sessions
  if (showGallery) {
    return (
      <SessionCompleteView
        session={currentSession}
        onBack={() => setShowGallery(false)}
        onContinue={getNextPendingAsset() ? () => setShowGallery(false) : undefined}
      />
    )
  }

  const template = getSessionTemplate(currentSession.templateId)
  const config = sessionTypeConfig[currentSession.templateId as keyof typeof sessionTypeConfig]
  const progress = getSessionProgress()
  const progressPercent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0

  return (
    <div className="flex-1 flex flex-col h-full bg-black overflow-hidden">
      {/* Session Header */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-zinc-900/80 backdrop-blur-xl">
        {/* Progress Bar */}
        <div className="h-1 bg-white/[0.05]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            className="h-full bg-gradient-to-r from-skinny-yellow to-skinny-lime"
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {(() => {
              const iconName = template?.icon || config?.icon || 'Package'
              const Icon = getIcon(iconName)
              return (
                <div className="p-2 rounded-xl bg-skinny-yellow/10">
                  <Icon size={24} className="text-skinny-yellow" />
                </div>
              )
            })()}
            <div>
              <h1 className="font-semibold text-white">{currentSession.title}</h1>
              <p className="text-xs text-white/50">
                {progress.completed}/{progress.total} assets
                {progress.requiredCompleted < progress.required && (
                  <span className="ml-2 text-skinny-yellow">
                    {progress.required - progress.requiredCompleted} required left
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Balance Display */}
            {whop && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <Wallet size={14} className="text-skinny-yellow" />
                <span className="text-sm font-medium text-white">
                  ${balanceDollars}
                </span>
              </div>
            )}
            {/* View Toggle */}
            <div className="flex items-center rounded-lg bg-white/[0.03] border border-white/[0.06] p-0.5">
              <button
                onClick={() => setViewMode('chat')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                  viewMode === 'chat'
                    ? "bg-skinny-yellow/10 text-skinny-yellow"
                    : "text-white/50 hover:text-white"
                )}
              >
                <MessageSquare size={14} />
                Chat
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                  viewMode === 'board'
                    ? "bg-skinny-yellow/10 text-skinny-yellow"
                    : "text-white/50 hover:text-white"
                )}
              >
                <LayoutGrid size={14} />
                Board
              </button>
            </div>
            {progress.completed > 0 && (
              <button
                onClick={() => setShowGallery(true)}
                className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm hover:bg-green-500/20 transition-colors"
              >
                View Gallery
              </button>
            )}
            <button
              onClick={() => setShowAssetPanel(!showAssetPanel)}
              className={cn(
                "p-2 rounded-lg transition-all",
                showAssetPanel
                  ? "bg-skinny-yellow/10 text-skinny-yellow border border-skinny-yellow/20"
                  : "text-white/50 hover:text-white hover:bg-white/[0.05] border border-transparent"
              )}
            >
              <Layers size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Board View - shows when viewMode is 'board' */}
        {viewMode === 'board' ? (
          <SessionBoardView
            session={currentSession}
            selectedAssetId={selectedAsset?.id || null}
            onSelectAsset={(asset) => {
              setSelectedAsset(asset)
              setViewMode('chat') // Switch to chat when selecting an asset
            }}
            onRegenerateAsset={(asset) => {
              setSelectedAsset(asset)
              setViewMode('chat')
              // Add regenerate message
              setMessages(prev => [...prev, {
                id: `system-${Date.now()}`,
                role: 'assistant' as const,
                content: `Let's create a new version of **${asset.name}**. What would you like to change or try differently?`,
                createdAt: new Date(),
              }])
            }}
          />
        ) : (
        <>
        {/* Asset Panel (Left) */}
        <AnimatePresence>
          {showAssetPanel && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 border-r border-white/[0.04] bg-zinc-950/80 backdrop-blur-2xl overflow-hidden"
            >
              <div className="h-full flex flex-col">
                <div className="px-4 py-3 border-b border-white/[0.04]">
                  <h3 className="text-sm font-medium text-white/70">Assets</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {currentSession.assets.map((asset) => {
                    const assetTemplate = template?.assets.find(
                      (a) => a.id === asset.templateAssetId
                    )
                    const isSelected = selectedAsset?.id === asset.id
                    const isRequired = assetTemplate?.required

                    return (
                      <button
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200",
                          isSelected
                            ? "bg-white/[0.06] border border-skinny-yellow/30"
                            : "hover:bg-white/[0.03] border border-transparent",
                          asset.status === 'completed' && "opacity-60"
                        )}
                      >
                        <div className="mt-0.5">
                          {getStatusIcon(asset.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium truncate",
                              asset.status === 'completed' ? "text-white/50" : "text-white"
                            )}>
                              {asset.name}
                            </span>
                            {isRequired && asset.status === 'pending' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-skinny-yellow/20 text-skinny-yellow rounded">
                                Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/40 mt-0.5">
                            {assetTemplate?.aspectRatio} • {assetTemplate?.modelSuggestion}
                          </p>
                          {asset.status === 'completed' && asset.outputUrl && (
                            <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.06]">
                              <img
                                src={asset.outputUrl}
                                alt={asset.name}
                                className="w-full h-16 object-cover"
                              />
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Current Asset Info Bar */}
          {selectedAsset && selectedAsset.status === 'pending' && (
            <div className="flex-shrink-0 px-4 py-3 bg-gradient-to-r from-skinny-yellow/5 to-transparent border-b border-white/[0.04]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-skinny-yellow/10">
                    <Zap size={16} className="text-skinny-yellow" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Creating: {getAssetTemplate(selectedAsset)?.name}
                    </p>
                    <p className="text-xs text-white/50">
                      {getAssetTemplate(selectedAsset)?.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Aspect Ratio */}
                  <span className="px-2 py-1 text-xs font-medium bg-white/[0.05] rounded-lg text-white/60">
                    {getAssetTemplate(selectedAsset)?.aspectRatio}
                  </span>

                  {/* Model Selector */}
                  {(() => {
                    // Determine available models based on current asset's media type
                    const currentTemplate = selectedAsset ? getAssetTemplate(selectedAsset) : null
                    const availableModels = currentTemplate?.mediaType === 'video' ? videoModels : imageModels
                    const allModels = [...imageModels, ...videoModels]
                    const selectedModel = allModels.find(m => m.id === selectedModelId)
                    const targetAspectRatio = currentTemplate?.aspectRatio || '1:1'

                    return (
                      <div className="relative" ref={modelSelectorRef}>
                        <button
                          onClick={() => setShowModelSelector(!showModelSelector)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
                        >
                          <span className="text-xs font-medium text-white">
                            {selectedModel?.name || selectedModelId || 'Select Model'}
                          </span>
                          {selectedModelId && validatedAspectRatio !== targetAspectRatio && (
                            <span className="text-[10px] text-yellow-500/80">({validatedAspectRatio})</span>
                          )}
                          <ChevronDown size={12} className={cn(
                            "text-white/50 transition-transform",
                            showModelSelector && "rotate-180"
                          )} />
                        </button>

                        <AnimatePresence>
                          {showModelSelector && (
                            <motion.div
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              className="absolute right-0 top-full mt-1 w-72 bg-zinc-900/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden"
                            >
                              <div className="max-h-[300px] overflow-y-auto p-1">
                                {availableModels.map((model) => {
                                  const supportsRatio = getModelAspectRatios(model.id).includes(targetAspectRatio)
                                  const fallbackRatio = validateAspectRatio(model.id, targetAspectRatio)

                                  return (
                                    <button
                                      key={model.id}
                                      onClick={() => {
                                        setSelectedModelId(model.id)
                                        setValidatedAspectRatio(fallbackRatio)
                                        setShowModelSelector(false)
                                      }}
                                      className={cn(
                                        "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                                        selectedModelId === model.id
                                          ? "bg-skinny-yellow/10 text-white"
                                          : "hover:bg-white/[0.05] text-white/70"
                                      )}
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                                        <ImageIcon size={14} className="text-white/50" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{model.name}</p>
                                        <div className="flex items-center gap-1">
                                          <p className="text-xs text-white/40">{model.provider}</p>
                                          {!supportsRatio && (
                                            <span className="text-[10px] text-yellow-500/70">
                                              (uses {fallbackRatio})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {selectedModelId === model.id && (
                                        <CheckCircle2 size={14} className="text-skinny-yellow flex-shrink-0" />
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })()}

                  {/* Skip Button */}
                  <button
                    onClick={() => handleSkipAsset(selectedAsset)}
                    className="px-3 py-1.5 text-xs text-white/50 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-skinny-yellow/20 to-skinny-lime/10 flex items-center justify-center">
                      <Sparkles size={14} className="text-skinny-yellow" />
                    </div>
                  )}

                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === 'user'
                      ? "bg-skinny-yellow text-black"
                      : "bg-white/[0.05] text-white border border-white/[0.06]"
                  )}>
                    {/* Attachments */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {message.attachments.map((a) => (
                          <img
                            key={a.id}
                            src={a.url}
                            alt={a.name}
                            className="h-20 rounded-lg object-cover"
                          />
                        ))}
                      </div>
                    )}

                    {/* Message content */}
                    {(() => {
                      // Parse director's notes and strip special blocks for assistant messages
                      const directorsNotes = message.role === 'assistant' ? parseDirectorsNotes(message.content) : null
                      const displayContent = message.role === 'assistant' ? stripSpecialBlocks(message.content) : message.content

                      return (
                        <>
                          <div className={cn(
                            "text-sm break-words prose prose-sm max-w-none prose-p:my-1 prose-p:leading-relaxed",
                            message.role === 'user'
                              ? "prose-p:text-black prose-strong:text-black prose-em:text-black/80"
                              : "prose-invert prose-strong:text-skinny-yellow prose-strong:font-semibold prose-em:text-white/70 prose-code:text-skinny-yellow prose-code:bg-white/[0.05] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-white/[0.03] prose-pre:border prose-pre:border-white/[0.08] prose-ul:my-2 prose-li:my-0.5 prose-headings:text-white prose-headings:font-medium"
                          )}>
                            {displayContent ? (
                              <ReactMarkdown>{displayContent}</ReactMarkdown>
                            ) : (isLoading && message.role === 'assistant' ? (
                              <span className="flex items-center gap-2 text-white/50">
                                <Loader2 size={14} className="animate-spin" />
                                Thinking...
                              </span>
                            ) : null)}
                          </div>

                          {/* Director's Notes - Collapsible UI */}
                          {directorsNotes && <DirectorsNotesDisplay notes={directorsNotes} />}
                        </>
                      )
                    })()}

                    {/* Generation result */}
                    {message.generation?.status === 'complete' && message.generation.url && (
                      <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.1]">
                        <img
                          src={message.generation.url}
                          alt="Generated"
                          className="w-full max-w-md"
                        />
                      </div>
                    )}

                    {/* Confirmation UI - Show Generate/Edit buttons */}
                    {message.role === 'assistant' &&
                     isConfirmationMessage(message) &&
                     message.id === getLastAssistantMessageId() &&
                     !isLoading &&
                     !currentGeneration && (
                      <div className="mt-4 pt-3 border-t border-white/[0.06]">
                        {/* Reference images section */}
                        {attachments.length > 0 && (
                          <div className="flex items-center gap-2 mb-3">
                            <ImageIcon size={14} className="text-skinny-yellow" />
                            <span className="text-xs text-white/60">References:</span>
                            <div className="flex gap-1.5">
                              {attachments.map((a) => (
                                <div key={a.id} className="relative group">
                                  <img
                                    src={a.url}
                                    alt={a.name}
                                    className="h-8 w-8 rounded-md object-cover border border-white/[0.1]"
                                  />
                                  <button
                                    onClick={() => handleRemoveAttachment(a.id)}
                                    className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X size={8} className="text-white" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => setShowImagePicker(true)}
                              className="p-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] transition-colors"
                            >
                              <Plus size={12} className="text-white/50" />
                            </button>
                          </div>
                        )}

                        {attachments.length === 0 && (
                          <button
                            onClick={() => setShowImagePicker(true)}
                            className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-dashed border-white/[0.1] transition-colors text-xs text-white/50"
                          >
                            <Plus size={12} />
                            Add reference images
                          </button>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={handleConfirmGenerate}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-skinny-yellow text-black font-medium text-sm hover:bg-skinny-lime transition-colors"
                          >
                            <Play size={14} />
                            Generate
                          </button>
                          <button
                            onClick={handleEditPrompt}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] text-white font-medium text-sm hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
                          >
                            <Pencil size={14} />
                            Edit Prompt
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Generation in progress */}
              {currentGeneration && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 justify-start"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-skinny-yellow/20 to-skinny-lime/10 flex items-center justify-center">
                    <Loader2 size={14} className="text-skinny-yellow animate-spin" />
                  </div>
                  <div className="bg-white/[0.05] border border-white/[0.06] rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-white font-medium">
                          {currentGeneration.status === 'planning' ? 'Planning generation...' : 'Creating your image...'}
                        </span>
                        <span className="text-xs text-white/50">
                          Using {currentGeneration.model}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Pending Approval Card - User must Accept, Regenerate, or Skip */}
              {pendingApproval && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 justify-start"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-500/20 to-skinny-lime/10 flex items-center justify-center">
                    <Check size={14} className="text-green-400" />
                  </div>
                  <div className="max-w-md p-4 bg-white/[0.03] rounded-2xl border border-skinny-yellow/20">
                    <p className="text-sm text-white/70 mb-3">
                      {pendingApproval.imageUrl?.includes('.mp4') || pendingApproval.imageUrl?.includes('video')
                        ? 'Your video is ready! What do you think?'
                        : 'Your image is ready! What do you think?'}
                    </p>

                    {/* Generated Media Preview - Image or Video */}
                    <div className="rounded-xl overflow-hidden border border-white/[0.1] mb-4">
                      {pendingApproval.imageUrl?.includes('.mp4') || pendingApproval.imageUrl?.includes('video') ? (
                        <video
                          src={pendingApproval.imageUrl}
                          controls
                          autoPlay
                          loop
                          muted
                          className="w-full max-h-64 object-cover"
                        />
                      ) : (
                        <img
                          src={pendingApproval.imageUrl}
                          alt="Generated"
                          className="w-full max-h-64 object-cover"
                        />
                      )}
                    </div>

                    {/* Prompt used */}
                    <p className="text-xs text-white/40 mb-4 line-clamp-2">
                      "{pendingApproval.prompt}"
                    </p>

                    {/* Approval Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleApproveGeneration}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/20 text-green-400 font-medium text-sm hover:bg-green-500/30 border border-green-500/30 transition-colors"
                      >
                        <Check size={14} />
                        Accept & Continue
                      </button>
                      <button
                        onClick={handleRegenerateGeneration}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] text-white/70 font-medium text-sm hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
                      >
                        <RefreshCw size={14} />
                        Regenerate
                      </button>
                      <button
                        onClick={handleSkipPendingApproval}
                        className="px-3 py-2 rounded-xl text-white/40 font-medium text-sm hover:text-white/60 hover:bg-white/[0.03] transition-colors"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="flex-shrink-0 p-4 border-t border-white/[0.04] bg-zinc-950/50">
            {/* Attachments Preview */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((a) => (
                  <div key={a.id} className="relative group">
                    <img
                      src={a.url}
                      alt={a.name}
                      className="h-16 w-16 rounded-lg object-cover border border-white/[0.1]"
                    />
                    <button
                      onClick={() => handleRemoveAttachment(a.id)}
                      className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-3 bg-white/[0.03] rounded-2xl border border-white/[0.06] p-2 focus-within:border-skinny-yellow/30 transition-colors">
                {/* Attachment Button */}
                <div className="relative">
                  <button
                    onClick={() => setShowImagePicker(!showImagePicker)}
                    className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    <Paperclip size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <AnimatePresence>
                    {showImagePicker && (
                      <ImageSourcePicker
                        isOpen={showImagePicker}
                        supportsVision={true}
                        onSelectLocalFile={() => {
                          fileInputRef.current?.click()
                          setShowImagePicker(false)
                        }}
                        onSelectImage={(img) => {
                          handleSelectImage(img)
                          setShowImagePicker(false)
                        }}
                        onClose={() => setShowImagePicker(false)}
                      />
                    )}
                  </AnimatePresence>
                </div>

                {/* Input */}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Describe what you want for "${getAssetTemplate(selectedAsset!)?.name || 'this asset'}"...`}
                  rows={1}
                  className="flex-1 bg-transparent text-white placeholder-white/30 resize-none focus:outline-none text-sm py-2 max-h-32"
                  style={{ minHeight: '40px' }}
                />

                {/* Send Button */}
                <button
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && attachments.length === 0)}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    input.trim() || attachments.length > 0
                      ? "bg-skinny-yellow text-black hover:bg-skinny-lime"
                      : "bg-white/[0.05] text-white/30"
                  )}
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}

export default SessionView
