'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Key, ExternalLink, AlertCircle, X, Camera, Palette, Share2, Play } from 'lucide-react'
import { useChat, SkillForApi, SkillCreationData, ChatAttachment } from '@/lib/context/chat-context'
import { useSkills } from '@/lib/context/skills-context'
import { useGeneration } from '@/lib/context/generation-context'
import { useApp } from '@/lib/context/app-context'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { hasApiKey } from '@/lib/api-settings'
import { EtherealBackground } from '@/components/ui/ethereal-background'
import { StoryboardView } from '@/components/storyboard/storyboard-view'
import { SessionView } from '@/components/sessions/session-view'
import { SessionPickerModal } from '@/components/sessions/session-picker-modal'
import { useSessions } from '@/lib/context/sessions-context'
import { SkinnyBrief, SkinnyBriefData, formatBriefForPrompt } from './skinny-brief'
import { toast } from 'sonner'

// Welcome suggestions - no emojis, use icons instead
const SUGGESTIONS = [
  {
    title: "Create a product photo",
    prompt: "I need a professional product photo for an e-commerce listing",
    icon: Camera,
  },
  {
    title: "Generate concept art",
    prompt: "Help me create concept art for a fantasy game character",
    icon: Palette,
  },
  {
    title: "Design a social media post",
    prompt: "I want to create an eye-catching Instagram post for my brand",
    icon: Share2,
  },
  {
    title: "Make a video thumbnail",
    prompt: "Help me design a YouTube thumbnail that gets clicks",
    icon: Play,
  },
]

interface ApiKeyBannerProps {
  onDismiss: () => void
}

function ApiKeyBanner({ onDismiss }: ApiKeyBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 max-w-sm w-full px-4"
    >
      <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-full px-4 py-2.5 shadow-2xl">
        <div className="flex items-center gap-3">
          <Key size={14} className="text-skinny-yellow flex-shrink-0" />
          <p className="text-xs text-white/60">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-skinny-yellow hover:text-skinny-green font-medium transition-colors"
            >
              Get a free API key
            </a>
            {' '}to start creating
          </p>
          <button
            onClick={onDismiss}
            className="p-1 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-colors ml-auto"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function ErrorBanner({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mx-4 mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30"
    >
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-red-300">{error}</p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  )
}

function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (prompt: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 relative animate-fadeIn">
      {/* Content Container - Centered */}
      <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto relative z-10 pt-8">
        {/* Logo with CSS floating animation - GPU accelerated */}
        <div className="mb-6 animate-float">
          <Image
            src="/skinny-logo.svg"
            alt="Skinny Studio"
            width={280}
            height={280}
            className="drop-shadow-[0_0_60px_rgba(214,252,81,0.5)]"
            priority
          />
        </div>

        {/* Title */}
        <h1 className="text-5xl font-medium text-white mb-2 tracking-tight animate-slideUp">
          Ready when you are
        </h1>

        {/* Animated underline */}
        <div
          className="h-px w-32 bg-gradient-to-r from-transparent via-skinny-yellow/40 to-transparent mb-4 animate-expandWidth"
        />

        {/* Subtitle */}
        <p className="text-sm text-white/40 mb-8 animate-slideUp animation-delay-100">
          Your All in One Creative AI Assistant
        </p>

        {/* Suggestion Pills - CSS transitions only, no Framer Motion */}
        <div className="flex flex-wrap justify-center gap-2 animate-slideUp animation-delay-200">
          {SUGGESTIONS.map((suggestion) => {
            const Icon = suggestion.icon
            return (
              <button
                key={suggestion.title}
                onClick={() => onSuggestionClick(suggestion.prompt)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl",
                  "bg-white/[0.02] backdrop-blur-sm border border-white/[0.05]",
                  "hover:bg-white/[0.05] hover:border-white/[0.1]",
                  "hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.97]",
                  "transition-all duration-200 group"
                )}
              >
                <Icon size={14} className="text-white/30 group-hover:text-skinny-yellow transition-colors" />
                <span className="text-xs font-medium text-white/50 group-hover:text-white/90 transition-colors">
                  {suggestion.title}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function ChatView() {
  const { state, sendMessage, clearError, setOnSkillCreation, setOnGenerationComplete, setOnInsufficientBalance, platformEnabled } = useChat()
  const { messages, isLoading, error, errorCode, currentConversationId } = state
  const { parseSkillReferences, addSkill } = useSkills()
  const { refreshGenerations } = useGeneration()
  const { showInsufficientBalance, selectedModel, setSelectedModel, models } = useApp()
  const { currentSession, loadSession, clearCurrentSession } = useSessions()

  // Check if storyboard mode is selected
  const isStoryboardMode = selectedModel?.id === 'storyboard-mode'
  // Check if session mode is selected
  const isSessionMode = selectedModel?.id === 'session-mode'

  // Session picker modal state
  const [showSessionPicker, setShowSessionPicker] = useState(false)

  // Get default model for reset
  const defaultModel = models.find(m => m.id === 'creative-consultant') || models[0]

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const [showApiKeyBanner, setShowApiKeyBanner] = useState(false)
  const [creativeBrief, setCreativeBrief] = useState<SkinnyBriefData | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Handle session mode - show picker if no current session, otherwise show session view
  useEffect(() => {
    if (isSessionMode && !currentSession) {
      setShowSessionPicker(true)
    }
  }, [isSessionMode, currentSession])

  // Handle exiting session mode
  const handleExitSession = useCallback(() => {
    clearCurrentSession()
    setSelectedModel(defaultModel)
  }, [clearCurrentSession, setSelectedModel, defaultModel])

  // Wire up skill creation callback - when AI creates a skill, add it to the skills library
  useEffect(() => {
    const handleSkillCreation = (skillData: SkillCreationData) => {
      try {
        // Convert SkillCreationData to the format addSkill expects
        const newSkillId = addSkill({
          name: skillData.name,
          shortcut: skillData.shortcut,
          description: skillData.description,
          category: skillData.category,
          icon: skillData.icon || '🎨',
          content: skillData.content,
          tags: skillData.tags || [],
          isBuiltIn: false,
          isActive: true, // Auto-activate new skills
        })

        // Show success toast
        toast.success(`Skill "${skillData.name}" created!`, {
          description: `Use @${skillData.shortcut} to apply this skill`,
          icon: skillData.icon || '🎨',
        })

        console.log('Created new skill:', newSkillId, skillData)
      } catch (error) {
        console.error('Failed to create skill:', error)
        toast.error('Failed to create skill')
      }
    }

    // Wrap in arrow function to prevent React from calling it as an updater function
    setOnSkillCreation(() => handleSkillCreation)

    // Cleanup on unmount
    return () => {
      setOnSkillCreation(() => null)
    }
  }, [addSkill, setOnSkillCreation])

  // Wire up generation completion callback - refresh the generations list when a new generation completes
  useEffect(() => {
    // Wrap in double arrow function: outer returns the callback to store, inner is the actual callback
    setOnGenerationComplete(() => () => {
      // Refresh generations to include the newly created one from the database
      refreshGenerations()
    })

    return () => {
      setOnGenerationComplete(() => null)
    }
  }, [refreshGenerations, setOnGenerationComplete])

  // Wire up insufficient balance callback - show modal when generation fails due to balance
  useEffect(() => {
    // Wrap in double arrow function: outer returns the callback to store, inner is the actual callback
    setOnInsufficientBalance(() => (required: number, available: number, modelName?: string) => {
      console.log('[ChatView] Showing insufficient balance modal:', { required, available, modelName })
      showInsufficientBalance(required, available, modelName)
    })

    return () => {
      setOnInsufficientBalance(() => null)
    }
  }, [showInsufficientBalance, setOnInsufficientBalance])

  // Check for API key on mount - don't show banner if platform mode is enabled
  useEffect(() => {
    setShowApiKeyBanner(!hasApiKey() && !platformEnabled)
  }, [platformEnabled])

  // Auto-scroll to bottom when new messages arrive or loading state changes
  useEffect(() => {
    if (messagesEndRef.current) {
      // Use a slight delay to ensure DOM has updated
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      })
    }
  }, [messages, isLoading])

  const handleSend = useCallback((content: string, attachments?: any[], selectedGenerationModelId?: string) => {
    // Parse skill references from the message (only @mentioned skills)
    const { skills: referencedSkills } = parseSkillReferences(content)

    // Convert to API format - only include skills explicitly mentioned with @
    const skillsForApi: SkillForApi[] = referencedSkills.map(s => ({
      name: s.name,
      shortcut: s.shortcut || '',
      icon: s.icon,
      content: s.content,
    }))

    // Format creative brief if present and prepend to system context
    const briefContext = formatBriefForPrompt(creativeBrief)

    // Don't preload all skills - only pass explicitly referenced skills (via @ mentions)
    // Brief is passed as part of skills context (prepended to skills)
    sendMessage(content, attachments, briefContext || undefined, skillsForApi.length > 0 ? skillsForApi : undefined, selectedGenerationModelId)
  }, [sendMessage, parseSkillReferences, creativeBrief])

  const handleSuggestionClick = useCallback((prompt: string) => {
    // Don't preload skills for suggestions - user must explicitly mention with @
    sendMessage(prompt, undefined, undefined)
  }, [sendMessage])

  // Quick action handlers for confirmation messages
  // Accept attachments to pass along with the confirmation message
  const handleQuickGenerate = useCallback((attachmentsToUse?: ChatAttachment[]) => {
    // Send a confirmation message to trigger generation WITH the reference images
    sendMessage('Yes, generate it!', attachmentsToUse, undefined)
  }, [sendMessage])

  const handleEditPrompt = useCallback(() => {
    // Focus the input so user can type their edit
    // The input component will handle the focus via its own ref
    const input = document.querySelector('textarea[placeholder*="conversation"], textarea[placeholder*="create"]') as HTMLTextAreaElement
    if (input) {
      input.focus()
      input.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // Find the index of the last assistant message that's a confirmation (to show buttons only on that one)
  const lastConfirmationIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && !msg.generation && !msg.isStreaming && msg.content) {
        const content = msg.content.toLowerCase()
        if (
          content.includes('estimated cost') ||
          content.includes('ready to create') ||
          content.includes('ready to generate') ||
          (content.includes('$0.') && (content.includes('does this') || content.includes('look good') || content.includes('shall i')))
        ) {
          return i
        }
      }
    }
    return -1
  })()

  const hasMessages = messages.length > 0

  // Show API key banner if error is about missing key
  const showKeyError = errorCode === 'NO_API_KEY' || errorCode === 'INVALID_API_KEY'

  // EARLY RETURNS AFTER ALL HOOKS ARE CALLED
  // If storyboard mode, render the StoryboardView instead
  if (isStoryboardMode) {
    return <StoryboardView />
  }

  // If session mode with active session, render SessionView
  if (isSessionMode && currentSession) {
    return (
      <>
        <SessionView onBack={handleExitSession} />
        <SessionPickerModal
          isOpen={showSessionPicker}
          onClose={() => setShowSessionPicker(false)}
          onCreateSession={() => {
            // createSession already sets currentSession, no need to call loadSession
            setShowSessionPicker(false)
          }}
        />
      </>
    )
  }

  // If session mode without active session, show picker
  if (isSessionMode && !currentSession) {
    return (
      <SessionPickerModal
        isOpen={true}
        onClose={() => {
          setShowSessionPicker(false)
          setSelectedModel(defaultModel) // Exit session mode if picker is closed
        }}
        onCreateSession={() => {
          // createSession already sets currentSession, no need to call loadSession
          setShowSessionPicker(false)
        }}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative min-h-0">
      {/* Ethereal Background - only on welcome screen */}
      {!hasMessages && (
        <EtherealBackground
          color="rgba(214, 252, 81, 0.08)"
          scale={50}
          speed={20}
        />
      )}

      {/* Banners */}
      <AnimatePresence>
        {showApiKeyBanner && !hasMessages && (
          <ApiKeyBanner onDismiss={() => setShowApiKeyBanner(false)} />
        )}
        {error && !showKeyError && (
          <ErrorBanner error={error} onDismiss={clearError} />
        )}
      </AnimatePresence>

      {/* Messages Area - Inline scroll container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 min-h-0"
      >
        <AnimatePresence mode="wait">
          {!hasMessages ? (
            <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto pt-6 px-4 pb-40"
            >
              {messages.map((message, index) => {
                // For confirmation messages, find the last user message's attachments to show as pending references
                const isConfirmationMsg = index === lastConfirmationIndex && !isLoading
                let pendingAttachments: ChatAttachment[] | undefined
                if (isConfirmationMsg && message.role === 'assistant') {
                  // ONLY check the IMMEDIATE previous message for attachments
                  // This prevents old reference images from earlier in the chat being auto-added
                  const prevMessage = messages[index - 1]
                  if (prevMessage?.role === 'user' && prevMessage?.attachments?.length) {
                    pendingAttachments = prevMessage.attachments.filter(
                      a => (a.type === 'image' || a.type === 'reference') && (a.url || a.base64)
                    )
                  }
                }
                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onQuickGenerate={(attachments) => handleQuickGenerate(attachments)}
                    onEditPrompt={handleEditPrompt}
                    showQuickActions={isConfirmationMsg}
                    pendingReferenceImages={pendingAttachments}
                  />
                )
              })}

              <div ref={messagesEndRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Gradient fade overlay - fades messages as they scroll toward input */}
      {hasMessages && (
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
          style={{
            height: '160px',
            background: 'linear-gradient(to top, rgb(0, 0, 0) 0%, rgb(0, 0, 0) 40%, transparent 100%)'
          }}
        />
      )}

      {/* Input Area - floating over background */}
      <div className="relative z-20 flex-shrink-0">
        {/* Skinny Brief - Quick creative context */}
        <div className="max-w-2xl mx-auto px-4 pb-2">
          <SkinnyBrief
            brief={creativeBrief}
            onBriefChange={setCreativeBrief}
          />
        </div>
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          placeholder={hasMessages ? "Continue the conversation..." : "What would you like to create?"}
          contextId={currentConversationId}
        />
      </div>
    </div>
  )
}
