'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layers,
  CheckCircle2,
  Circle,
  Loader2,
  SkipForward,
  ChevronLeft,
  Send,
  Sparkles,
  Image as ImageIcon,
  Package,
  Music,
  Target,
  Smartphone,
  Paperclip,
  X,
  LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessions } from '@/lib/context/sessions-context'
import { useUser } from '@/lib/context/user-context'
import { sessionTypeConfig, SessionAsset } from '@/lib/types'
import { getSessionTemplate } from '@/lib/sessions/session-templates'
import { ImageSourcePicker } from '@/components/chat/image-source-picker'
import { ChatAttachment } from '@/lib/context/chat-context'
import { toast } from 'sonner'

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

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  generationUrl?: string
  attachments?: Attachment[]
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

  const { whop, refreshUser } = useUser()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<SessionAsset | null>(null)
  const [showAssetPanel, setShowAssetPanel] = useState(true)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showImagePicker, setShowImagePicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Clear attachments when switching sessions to prevent stale references
  useEffect(() => {
    setAttachments([])
  }, [currentSession?.id])

  // Initial greeting when session is loaded
  useEffect(() => {
    if (currentSession && messages.length === 0) {
      const template = getSessionTemplate(currentSession.templateId)
      const progress = getSessionProgress()
      const nextAsset = getNextPendingAsset()
      const nextTemplate = nextAsset ? getAssetTemplate(nextAsset) : null

      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Welcome to your ${template?.name || 'creative'} session: "${currentSession.title}"!\n\n${
          currentSession.briefContext?.vibe
            ? `I see you're going for a "${currentSession.briefContext.vibe}" vibe`
            : 'Let\'s create some amazing content'
        }${currentSession.briefContext?.platform ? ` for ${currentSession.briefContext.platform}` : ''}.\n\nYou have ${progress.total} assets to create (${progress.required} required).${
          nextAsset && nextTemplate
            ? `\n\nLet's start with "${nextTemplate.name}" - ${nextTemplate.description}\n\nDescribe what you'd like for this ${nextTemplate.aspectRatio} ${nextTemplate.modelSuggestion.includes('veo') ? 'video' : 'image'}:`
            : ''
        }`,
        createdAt: new Date(),
      }])
    }
  }, [currentSession, getSessionProgress, getNextPendingAsset, getAssetTemplate])

  // Auto-select the next pending asset
  useEffect(() => {
    if (!selectedAsset || selectedAsset.status !== 'pending') {
      const next = getNextPendingAsset()
      if (next) setSelectedAsset(next)
    }
  }, [selectedAsset, getNextPendingAsset, currentSession?.assets])

  // Update session status when starting work
  useEffect(() => {
    if (currentSession?.status === 'planning' && messages.length > 1) {
      updateSession(currentSession.id, { status: 'in_progress' })
    }
  }, [currentSession, messages.length, updateSession])

  const handleSend = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading || !currentSession) return

    const template = getSessionTemplate(currentSession.templateId)
    const progress = getSessionProgress()
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

    try {
      // Build session context for the system prompt
      const sessionSystemContext = `
## SESSION MODE ACTIVE
You are helping with a ${template?.name || 'creative'} session.

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
- Suggested Model: ${nextTemplate.modelSuggestion}
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

Guide the user through creating each asset. When they describe what they want, help them create a great prompt for the ${nextTemplate?.modelSuggestion || 'image generation model'}.
Use the correct aspect ratio (${nextTemplate?.aspectRatio || '1:1'}) for this asset.
Keep responses concise and focused on helping them create this specific asset.
`

      // Prepare attachments for API - convert to format expected by chat API
      // For local files with File objects, we need to convert to base64 (blob URLs don't work on server)
      const attachmentsForApi = await Promise.all(currentAttachments.map(async (a) => {
        const file = a.file
        if (file) {
          // Local file - convert to base64
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const result = reader.result as string
              // Remove data URL prefix to get just base64
              resolve(result.split(',')[1])
            }
            reader.readAsDataURL(file)
          })
          return {
            type: 'image' as const,
            url: a.url,
            name: a.name,
            base64,
            mimeType: file.type,
          }
        } else if (a.base64) {
          // Already has base64 (from ImageSourcePicker local upload)
          return {
            type: a.type,
            url: a.url,
            name: a.name,
            base64: a.base64,
            mimeType: a.mimeType,
          }
        } else {
          // Skinny Hub / reference image - use URL directly
          return {
            type: a.type,
            url: a.url,
            name: a.name,
          }
        }
      }))

      // Call the chat API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(whop?.id && { 'X-Whop-User-Id': whop.id }),
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: sessionSystemContext + '\n\n---\n\nUser: ' + userMessage.content },
          ],
          modelId: 'gemini-2.5-flash',
          selectedGenerationModelId: nextTemplate?.modelSuggestion || 'seedream-4.5',
          aspectRatio: nextTemplate?.aspectRatio || '1:1',
          attachments: attachmentsForApi.length > 0 ? attachmentsForApi : undefined,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Chat API error:', errorText)
        throw new Error('Failed to get response')
      }

      // Parse SSE stream
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let assistantContent = ''
      let generationUrl: string | undefined

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
              }
              if (parsed.generation?.url) {
                generationUrl = parsed.generation.url
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

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        createdAt: new Date(),
        generationUrl,
      }

      setMessages(prev => [...prev, assistantMessage])

      // If we got a generation, mark the asset as complete and refresh balance
      if (generationUrl && nextAsset) {
        markAssetCompleted(nextAsset.id, generationUrl)
        toast.success(`${nextTemplate?.name || 'Asset'} created!`)
        // Refresh user data to update balance
        refreshUser()
      }

    } catch (error) {
      console.error('Chat error:', error)
      toast.error('Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, currentSession, whop, getSessionProgress, getNextPendingAsset, getAssetTemplate, markAssetCompleted, refreshUser, attachments])

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
          content: `Okay, I've skipped that one. Let's move on to "${nextTemplate.name}" - ${nextTemplate.description}\n\nWhat would you like for this ${nextTemplate.aspectRatio} asset?`,
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

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle selecting image from ImageSourcePicker (local or Skinny Hub)
  const handleSelectImage = (attachment: ChatAttachment) => {
    setAttachments(prev => [...prev, attachment as Attachment])
  }

  // Remove attachment
  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id)
      // Revoke blob URL if it's a local file
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAssetPanel(!showAssetPanel)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                showAssetPanel
                  ? "bg-skinny-yellow/10 text-skinny-yellow"
                  : "text-white/50 hover:text-white hover:bg-white/[0.05]"
              )}
            >
              <Layers size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Asset Panel (Left) */}
        <AnimatePresence>
          {showAssetPanel && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 border-r border-white/[0.06] bg-zinc-900/50 overflow-hidden"
            >
              <div className="h-full flex flex-col">
                {/* Panel Header */}
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <h3 className="text-sm font-medium text-white/70">Assets</h3>
                </div>

                {/* Asset List */}
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
                          "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all",
                          isSelected
                            ? "bg-skinny-yellow/10 border border-skinny-yellow/30"
                            : "hover:bg-white/[0.03] border border-transparent",
                          asset.status === 'skipped' && "opacity-50"
                        )}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {getStatusIcon(asset.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium truncate",
                              isSelected ? "text-skinny-yellow" : "text-white"
                            )}>
                              {asset.name}
                            </span>
                            {isRequired && asset.status === 'pending' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-skinny-yellow/20 text-skinny-yellow">
                                Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/40 truncate mt-0.5">
                            {assetTemplate?.aspectRatio} - {assetTemplate?.modelSuggestion}
                          </p>
                        </div>

                        {/* Thumbnail if completed */}
                        {asset.status === 'completed' && asset.outputUrl && (
                          <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-white/[0.05]">
                            <img
                              src={asset.outputUrl}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Skip Asset Button */}
                {selectedAsset && selectedAsset.status === 'pending' && (
                  <div className="p-3 border-t border-white/[0.06]">
                    <button
                      onClick={() => handleSkipAsset(selectedAsset)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
                    >
                      <SkipForward size={14} />
                      Skip this asset
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Area (Center) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Selected Asset Info Bar */}
          {selectedAsset && selectedAsset.status === 'pending' && (
            <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-skinny-yellow/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-skinny-yellow/10">
                  <ImageIcon size={16} className="text-skinny-yellow" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white">
                    Creating: {selectedAsset.name}
                  </h4>
                  {(() => {
                    const tpl = getAssetTemplate(selectedAsset)
                    return tpl ? (
                      <p className="text-xs text-white/50 truncate">
                        {tpl.description}
                      </p>
                    ) : null
                  })()}
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  {(() => {
                    const tpl = getAssetTemplate(selectedAsset)
                    return tpl ? (
                      <>
                        <span className="px-2 py-1 rounded bg-white/[0.05]">
                          {tpl.aspectRatio}
                        </span>
                        <span className="px-2 py-1 rounded bg-white/[0.05]">
                          {tpl.modelSuggestion}
                        </span>
                      </>
                    ) : null
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Session Complete Banner */}
          {progress.requiredCompleted === progress.required && progress.required > 0 && (
            <div className="flex-shrink-0 px-4 py-3 border-b border-green-500/20 bg-gradient-to-r from-green-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 size={16} className="text-green-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-green-400">
                    All required assets complete!
                  </h4>
                  <p className="text-xs text-white/50">
                    You can continue adding optional assets or finish the session.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-skinny-yellow/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-skinny-yellow" />
                    </div>
                  )}
                  <div className="max-w-[80%] space-y-2">
                    {/* Show user attachments above message */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {message.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="w-20 h-20 rounded-lg overflow-hidden border border-white/10"
                          >
                            <img
                              src={att.url}
                              alt={att.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3",
                        message.role === 'user'
                          ? "bg-skinny-yellow text-black"
                          : "bg-zinc-800 text-white"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {/* Show generated image */}
                    {message.generationUrl && (
                      <div className="rounded-xl overflow-hidden border border-white/[0.1] max-w-sm">
                        <img
                          src={message.generationUrl}
                          alt="Generated"
                          className="w-full h-auto"
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-skinny-yellow/20 flex items-center justify-center">
                  <Loader2 size={14} className="text-skinny-yellow animate-spin" />
                </div>
                <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="flex-shrink-0 border-t border-white/[0.06] p-4 relative">
            {/* Attachment Previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="relative group w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 border border-white/10"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => handleRemoveAttachment(attachment.id)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-[10px] text-white/70 truncate">
                      {attachment.type === 'reference' ? 'Hub' : 'Upload'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Image Source Picker (Local + Skinny Hub) */}
            <ImageSourcePicker
              isOpen={showImagePicker}
              onClose={() => setShowImagePicker(false)}
              onSelectLocalFile={() => fileInputRef.current?.click()}
              onSelectImage={handleSelectImage}
              supportsVision={true}
            />

            <div className="flex items-end gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Add Image Button */}
              <button
                onClick={() => setShowImagePicker(true)}
                disabled={isLoading}
                className={cn(
                  "p-3 rounded-xl transition-colors disabled:opacity-50",
                  showImagePicker
                    ? "bg-skinny-yellow/20 text-skinny-yellow"
                    : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                )}
                title="Add reference image"
              >
                <Paperclip size={18} />
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedAsset && selectedAsset.status === 'pending'
                    ? `Describe what you want for "${selectedAsset.name}"...`
                    : 'Ask about your session...'
                }
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 resize-none min-h-[48px] max-h-[150px] focus:outline-none focus:border-skinny-yellow/50"
                rows={1}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                className={cn(
                  "p-3 rounded-xl transition-colors",
                  (input.trim() || attachments.length > 0) && !isLoading
                    ? "bg-skinny-yellow text-black hover:bg-skinny-lime"
                    : "bg-zinc-800 text-zinc-500"
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

        {/* Brief Context Panel (Right) - Optional */}
        {currentSession.briefContext && (
          <div className="hidden xl:block w-64 flex-shrink-0 border-l border-white/[0.06] bg-zinc-900/30 p-4">
            <h3 className="text-sm font-medium text-white/70 mb-3">Creative Brief</h3>
            <div className="space-y-3">
              {currentSession.briefContext.vibe && (
                <div>
                  <label className="text-xs text-white/40 block">Vibe</label>
                  <p className="text-sm text-white mt-0.5">{currentSession.briefContext.vibe}</p>
                </div>
              )}
              {currentSession.briefContext.platform && (
                <div>
                  <label className="text-xs text-white/40 block">Platform</label>
                  <p className="text-sm text-white mt-0.5">{currentSession.briefContext.platform}</p>
                </div>
              )}
              {currentSession.briefContext.style && (
                <div>
                  <label className="text-xs text-white/40 block">Style</label>
                  <p className="text-sm text-white mt-0.5">{currentSession.briefContext.style}</p>
                </div>
              )}
              {currentSession.briefContext.outputType && (
                <div>
                  <label className="text-xs text-white/40 block">Output</label>
                  <p className="text-sm text-white mt-0.5">{currentSession.briefContext.outputType}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SessionView
