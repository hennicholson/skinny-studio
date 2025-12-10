'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Key, ExternalLink, AlertCircle, X, Camera, Palette, Share2, Play } from 'lucide-react'
import { useChat, SkillForApi } from '@/lib/context/chat-context'
import { useSkills } from '@/lib/context/skills-context'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { hasApiKey } from '@/lib/api-settings'
import { EtherealBackground } from '@/components/ui/ethereal-background'

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
            width={56}
            height={56}
            className="drop-shadow-[0_0_40px_rgba(214,252,81,0.4)]"
            priority
          />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-medium text-white mb-2 tracking-tight animate-slideUp">
          How can I help today?
        </h1>

        {/* Animated underline */}
        <div
          className="h-px w-32 bg-gradient-to-r from-transparent via-white/20 to-transparent mb-4 animate-expandWidth"
        />

        {/* Subtitle */}
        <p className="text-sm text-white/40 mb-8 animate-slideUp animation-delay-100">
          Your AI creative director for images & video
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
  const { state, sendMessage, clearError } = useChat()
  const { messages, isLoading, error, errorCode } = state
  const { parseSkillReferences } = useSkills()

  const [showApiKeyBanner, setShowApiKeyBanner] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Check for API key on mount
  useEffect(() => {
    setShowApiKeyBanner(!hasApiKey())
  }, [])

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

    // Don't preload all skills - only pass explicitly referenced skills (via @ mentions)
    sendMessage(content, attachments, undefined, skillsForApi.length > 0 ? skillsForApi : undefined, selectedGenerationModelId)
  }, [sendMessage, parseSkillReferences])

  const handleSuggestionClick = useCallback((prompt: string) => {
    // Don't preload skills for suggestions - user must explicitly mention with @
    sendMessage(prompt, undefined, undefined)
  }, [sendMessage])

  const hasMessages = messages.length > 0

  // Show API key banner if error is about missing key
  const showKeyError = errorCode === 'NO_API_KEY' || errorCode === 'INVALID_API_KEY'

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
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

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

      {/* Input Area - positioned above the gradient */}
      <div className="relative z-20 flex-shrink-0 bg-black">
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          placeholder={hasMessages ? "Continue the conversation..." : "What would you like to create?"}
        />
      </div>
    </div>
  )
}
