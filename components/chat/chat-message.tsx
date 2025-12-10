'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { User, Bot, Copy, Check, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { ChatMessage as ChatMessageType, ChatAttachment, GenerationResult } from '@/lib/context/chat-context'
import { useState, useCallback } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'

interface ChatMessageProps {
  message: ChatMessageType
}

// Inline Generation Card for chat
function GenerationInline({ generation }: { generation: GenerationResult }) {
  const { status, model, result, error } = generation

  if (status === 'planning') {
    return (
      <div className="mt-3 p-4 rounded-xl backdrop-blur-sm bg-white/[0.02] border border-white/[0.05]">
        <div className="flex items-center gap-2 text-skinny-yellow">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-medium">Planning generation with {model}...</span>
        </div>
      </div>
    )
  }

  if (status === 'generating') {
    return (
      <div className="mt-3 p-4 rounded-xl backdrop-blur-sm bg-white/[0.02] border border-white/[0.05]">
        <div className="flex items-center gap-2 text-skinny-yellow">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-medium">Generating with {model}...</span>
        </div>
        <div className="mt-3 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-skinny-yellow"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 30, ease: 'linear' }}
          />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mt-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm font-medium">Generation failed</span>
        </div>
        {error && <p className="mt-2 text-xs text-red-400/80">{error}</p>}
      </div>
    )
  }

  if (status === 'complete' && result) {
    return (
      <div className="mt-3">
        <div className="relative group rounded-xl overflow-hidden border border-white/[0.1] hover:border-skinny-yellow/30 transition-colors">
          <img
            src={result.imageUrl}
            alt={result.prompt}
            className="w-full max-w-md h-auto"
            loading="lazy"
          />
          <div className="absolute top-2 left-2">
            <span className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white/80 text-[10px] font-medium">
              {model}
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/30 italic">"{result.prompt}"</p>
      </div>
    )
  }

  return null
}

// Attachment previews
function AttachmentPreviews({ attachments }: { attachments: ChatAttachment[] }) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  if (attachments.length === 0) return null

  const imageCount = attachments.filter(a => a.type === 'image').length
  const isSingleImage = imageCount === 1

  return (
    <>
      <div className={cn(
        "flex flex-wrap gap-2 mb-2",
        isSingleImage && "max-w-xs"
      )}>
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className={cn(
              "relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-800 cursor-pointer hover:border-zinc-500 transition-colors",
              isSingleImage ? "w-full aspect-auto max-h-48" : "w-16 h-16"
            )}
            onClick={() => setExpandedImage(attachment.url)}
          >
            {attachment.type === 'image' ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                className={cn(
                  "object-cover",
                  isSingleImage ? "w-full h-full max-h-48 object-contain" : "w-full h-full"
                )}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={20} className="text-zinc-500" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expanded image modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Expanded view"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <span className="absolute bottom-4 text-zinc-400 text-sm">Click anywhere to close</span>
        </div>
      )}
    </>
  )
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  const copyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [message.content])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-3 px-4 py-4",
        isUser ? "flex-row-reverse" : ""
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-zinc-800/80 text-zinc-400"
            : "bg-white/[0.08] backdrop-blur-sm border border-white/[0.1] text-skinny-yellow"
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Content */}
      <div className={cn("flex-1 max-w-[80%]", isUser ? "items-end" : "items-start")}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentPreviews attachments={message.attachments} />
        )}

        {/* Message Bubble */}
        <div
          className={cn(
            "relative group rounded-2xl px-4 py-3",
            isUser
              ? "bg-skinny-yellow text-black rounded-tr-sm"
              : "backdrop-blur-sm bg-white/[0.03] border border-white/[0.06] text-white/90 rounded-tl-sm"
          )}
        >
          {/* Text Content */}
          {message.content && (
            <div className="text-sm break-words prose prose-sm prose-invert max-w-none prose-p:my-1 prose-p:leading-relaxed prose-strong:text-skinny-yellow prose-strong:font-semibold prose-em:text-white/70 prose-code:text-skinny-yellow prose-code:bg-white/[0.05] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-white/[0.03] prose-pre:border prose-pre:border-white/[0.08] prose-ul:my-2 prose-li:my-0.5 prose-headings:text-white prose-headings:font-medium">
              <ReactMarkdown>
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
              )}
            </div>
          )}

          {/* Loading indicator for empty streaming message */}
          {!message.content && message.isStreaming && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-skinny-yellow/60 animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs text-white/40">Thinking...</span>
            </div>
          )}

          {/* Generation inline */}
          {message.generation && <GenerationInline generation={message.generation} />}

          {/* Copy button (assistant only) */}
          {isAssistant && message.content && !message.isStreaming && (
            <button
              onClick={copyContent}
              className="absolute -bottom-2 right-2 p-1.5 rounded-lg backdrop-blur-sm bg-black/60 border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20 opacity-0 group-hover:opacity-100 transition-all shadow-lg"
              title="Copy message"
            >
              {copied ? <Check size={12} className="text-skinny-yellow" /> : <Copy size={12} />}
            </button>
          )}
        </div>

        {/* Timestamp */}
        <span className={cn(
          "text-[10px] text-zinc-600 mt-1 block",
          isUser ? "text-right" : "text-left"
        )}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
})
