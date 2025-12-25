'use client'

import { memo, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { User, Bot, Copy, Check, Loader2, Image as ImageIcon, AlertCircle, Download, ExternalLink, Bookmark, Video, RefreshCw, MessageSquarePlus, Pencil, Sparkles, Play, Save, ChevronDown, ChevronUp, ChevronRight, Lightbulb, X, Plus } from 'lucide-react'
import { ChatMessage as ChatMessageType, ChatAttachment, GenerationResult } from '@/lib/context/chat-context'
import { useState, useCallback } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import { useGeneration, Generation } from '@/lib/context/generation-context'
import { useApp } from '@/lib/context/app-context'
import { useSkills } from '@/lib/context/skills-context'
import { useSavedPrompts } from '@/lib/context/saved-prompts-context'
import { Skill } from '@/lib/types'
import { toast } from 'sonner'
import { SaveSkillModal } from '@/components/modals/save-skill-modal'
import { DirectorsNotes } from '@/lib/context/chat-context'

// Smart image component that handles temporary URL failures
// Falls back to permanent URL from database if temp URL fails
function SmartImage({
  src,
  alt,
  className,
  generationId,
  onLoadSuccess
}: {
  src: string
  alt: string
  className?: string
  generationId?: string
  onLoadSuccess?: () => void
}) {
  const [currentSrc, setCurrentSrc] = useState(src)
  const [hasError, setHasError] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const { generations, refreshGenerations } = useGeneration()

  // Try to find permanent URL from database
  const findPermanentUrl = useCallback(() => {
    // Look for a generation that might have this image
    for (const gen of generations) {
      if (gen.output_urls && gen.output_urls.length > 0) {
        // Check if any permanent URL exists for this generation
        // Match by checking if the generation was recent (within last 5 minutes)
        const genTime = new Date(gen.created_at || 0).getTime()
        const now = Date.now()
        if (now - genTime < 5 * 60 * 1000) {
          return gen.output_urls[0]
        }
      }
    }
    return null
  }, [generations])

  const handleError = useCallback(async () => {
    if (retryCount >= 3) {
      setHasError(true)
      return
    }

    setIsRetrying(true)

    // Wait a bit then refresh generations to get permanent URL
    await new Promise(r => setTimeout(r, 2000))
    await refreshGenerations()

    // Try to find permanent URL
    const permanentUrl = findPermanentUrl()
    if (permanentUrl && permanentUrl !== currentSrc) {
      setCurrentSrc(permanentUrl)
      setRetryCount(prev => prev + 1)
    } else {
      // Retry same URL after delay (webhook might still be processing)
      setRetryCount(prev => prev + 1)
      setCurrentSrc(src + `?retry=${retryCount + 1}`)
    }

    setIsRetrying(false)
  }, [retryCount, refreshGenerations, findPermanentUrl, currentSrc, src])

  const handleLoad = useCallback(() => {
    setHasError(false)
    setIsRetrying(false)
    onLoadSuccess?.()
  }, [onLoadSuccess])

  if (hasError) {
    return (
      <div className={cn("flex flex-col items-center justify-center bg-white/[0.02] rounded-xl p-8", className)}>
        <AlertCircle className="w-8 h-8 text-white/30 mb-2" />
        <p className="text-xs text-white/40">Image failed to load</p>
        <button
          onClick={() => {
            setHasError(false)
            setRetryCount(0)
            setCurrentSrc(src)
          }}
          className="mt-2 text-xs text-skinny-yellow hover:underline flex items-center gap-1"
        >
          <RefreshCw size={10} />
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      {isRetrying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl z-10">
          <Loader2 className="w-6 h-6 text-skinny-yellow animate-spin" />
        </div>
      )}
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        loading="lazy"
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  )
}

// Strip generation blocks from display text
function stripGenerationBlock(text: string): string {
  return text.replace(/```generate\s*\n[\s\S]*?\n```/g, '').trim()
}

// Helper to detect if a URL is a video
function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
  const lowerUrl = url.toLowerCase()
  return videoExtensions.some(ext => lowerUrl.includes(ext))
}

// Skill mention component with hover tooltip
function SkillMention({ shortcut, skill }: { shortcut: string; skill?: Skill }) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!skill) {
    // Skill not found - just show as text
    return <span className="text-skinny-yellow">@{shortcut}</span>
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-skinny-yellow cursor-help hover:underline decoration-skinny-yellow/50">
        @{shortcut}
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-zinc-900/95 backdrop-blur-xl border border-white/[0.1] rounded-lg shadow-2xl z-50">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-lg">{skill.icon || '📌'}</span>
            <div>
              <div className="text-sm font-medium text-white">{skill.name}</div>
              <div className="text-[10px] text-white/40">{skill.category}</div>
            </div>
          </div>
          <p className="text-[11px] text-white/60 mb-2">{skill.description}</p>
          {skill.content && (
            <div className="space-y-0.5">
              {skill.content.split('\n').filter(l => l.trim()).slice(0, 3).map((line, i) => (
                <p key={i} className="text-[10px] text-white/40 truncate">
                  • {line.replace(/^[-•*#]\s*/, '').trim().slice(0, 40)}...
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  )
}

// Render text with skill highlighting
function renderWithSkillHighlights(content: string, skills: Skill[]): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /@([\w-]+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const shortcut = match[1]
    const skill = skills.find(s => s.shortcut === shortcut)

    parts.push(
      <SkillMention key={match.index} shortcut={shortcut} skill={skill} />
    )

    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts
}

interface ChatMessageProps {
  message: ChatMessageType
  /** Callback when Generate button is clicked - receives the final attachments to use */
  onQuickGenerate?: (attachments?: ChatAttachment[]) => void
  onEditPrompt?: () => void
  showQuickActions?: boolean
  /** Full ChatAttachment objects that will be used when Generate is clicked - can be edited */
  pendingReferenceImages?: ChatAttachment[]
}

// Director's Notes Display - Expandable insights from the AI
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
    </motion.div>
  )
}

// Inline Generation Card for chat
function GenerationInline({ generation }: { generation: GenerationResult }) {
  const { status, model, result, error, params } = generation
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [recoveredGeneration, setRecoveredGeneration] = useState<Generation | null>(null)
  const { addGeneration, generations, refreshGenerations } = useGeneration()
  const { showToast } = useApp()

  // Recovery polling: when stuck in generating or pending state, poll the library
  // to find the completed generation and display it
  const isStuck = status === 'generating' || (status === 'complete' && result?.pending)

  useEffect(() => {
    if (!isStuck || recoveredGeneration) return

    // Poll library every 5 seconds when stuck
    const interval = setInterval(async () => {
      console.log('[GenerationInline] Polling library for stuck generation recovery')
      await refreshGenerations()
    }, 5000)

    // Also do an immediate refresh
    refreshGenerations()

    return () => clearInterval(interval)
  }, [isStuck, recoveredGeneration, refreshGenerations])

  // Try to find matching generation in library when stuck
  useEffect(() => {
    if (!isStuck || recoveredGeneration) return

    // Find matching generation by model and prompt (within recent time window)
    // Use params.prompt if available (from the generation request)
    const searchPrompt = params?.prompt || result?.prompt
    if (!searchPrompt) return

    const match = generations.find(g =>
      g.model_slug === model &&
      g.prompt === searchPrompt &&
      g.replicate_status === 'succeeded' &&
      g.output_urls?.length > 0
    )

    if (match) {
      console.log('[GenerationInline] Found recovered generation in library:', match.id)
      setRecoveredGeneration(match)
    }
  }, [generations, model, params?.prompt, result?.prompt, isStuck, recoveredGeneration])

  // If we recovered a generation, use its data
  const effectiveResult = recoveredGeneration ? {
    imageUrl: recoveredGeneration.output_urls[0],
    outputUrls: recoveredGeneration.output_urls,
    prompt: recoveredGeneration.prompt,
    pending: false,
  } : result
  const effectiveStatus = recoveredGeneration ? 'complete' : status

  // Get all output URLs (for sequential generation support)
  const allOutputUrls = useMemo(() => {
    if (!effectiveResult) return []
    return effectiveResult.outputUrls || [effectiveResult.imageUrl]
  }, [effectiveResult])

  // Check if already saved - compare against output_urls array
  const isAlreadySaved = useMemo(() => {
    if (!effectiveResult?.imageUrl) return false
    return generations.some(g => g.output_urls?.includes(effectiveResult.imageUrl))
  }, [generations, effectiveResult?.imageUrl])

  const handleSaveToLibrary = useCallback(() => {
    if (!effectiveResult?.imageUrl || isAlreadySaved || isSaved) return

    // Create generation matching the database schema - save ALL output URLs
    const newGeneration: Generation = {
      id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      prompt: effectiveResult.prompt,
      output_urls: allOutputUrls,
      model_slug: model,
      model_category: 'image',
      parameters: params,
      created_at: new Date().toISOString(),
      isPublic: false,
    }

    addGeneration(newGeneration)
    setIsSaved(true)
    showToast('success', `Saved ${allOutputUrls.length} image${allOutputUrls.length > 1 ? 's' : ''} to Library`)
  }, [effectiveResult, model, params, addGeneration, showToast, isAlreadySaved, isSaved, allOutputUrls])

  const handleDownload = useCallback(async (urlToDownload?: string) => {
    const downloadUrl = urlToDownload || effectiveResult?.imageUrl
    if (!downloadUrl) return
    setIsDownloading(true)
    try {
      const response = await fetch(downloadUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `skinny-studio-${model}-${Date.now()}.${blob.type.split('/')[1] || 'png'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setIsDownloading(false)
    }
  }, [effectiveResult?.imageUrl, model])

  if (effectiveStatus === 'planning') {
    return (
      <div className="mt-3 p-4 rounded-xl backdrop-blur-sm bg-white/[0.02] border border-white/[0.05]">
        <div className="flex items-center gap-2 text-skinny-yellow">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-medium">Planning generation with {model}...</span>
        </div>
      </div>
    )
  }

  if (effectiveStatus === 'generating') {
    return (
      <div className="mt-3 p-4 rounded-xl backdrop-blur-sm bg-white/[0.02] border border-white/[0.05]">
        <div className="flex items-center gap-2 text-skinny-yellow">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-medium">Generating with {model}...</span>
        </div>
        {/* Indeterminate progress bar - pulses to show activity without misleading duration */}
        <div className="mt-3 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-skinny-yellow w-1/3 rounded-full"
            animate={{
              x: ['0%', '200%', '0%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />
        </div>
        <p className="mt-2 text-[10px] text-white/30">This may take a moment depending on model complexity</p>
      </div>
    )
  }

  if (effectiveStatus === 'error') {
    const isBalanceError = generation.code === 'INSUFFICIENT_BALANCE'
    const required = generation.required || 0
    const available = generation.available || 0

    return (
      <div className={cn(
        "mt-3 p-4 rounded-xl",
        isBalanceError ? "bg-amber-500/10 border border-amber-500/20" : "bg-red-500/10 border border-red-500/20"
      )}>
        <div className={cn(
          "flex items-center gap-2",
          isBalanceError ? "text-amber-400" : "text-red-400"
        )}>
          <AlertCircle size={16} />
          <span className="text-sm font-medium">
            {isBalanceError ? 'Insufficient credits' : 'Generation failed'}
          </span>
        </div>
        {isBalanceError ? (
          <p className="mt-2 text-xs text-amber-400/80">
            This generation costs ${(required / 100).toFixed(2)} but you only have ${(available / 100).toFixed(2)} available.
          </p>
        ) : (
          error && <p className="mt-2 text-xs text-red-400/80">{error}</p>
        )}
      </div>
    )
  }

  if (effectiveStatus === 'complete' && effectiveResult) {
    // Handle pending state (generation still processing in background)
    // Note: This should not trigger if we have a recovered generation
    if (effectiveResult.pending || (!effectiveResult.imageUrl && effectiveResult.message)) {
      return (
        <div className="mt-3 p-4 rounded-xl backdrop-blur-sm bg-white/[0.02] border border-white/[0.05]">
          <div className="flex items-center gap-2 text-skinny-yellow">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm font-medium">Processing with {model}...</span>
          </div>
          <p className="mt-2 text-xs text-white/50">
            {effectiveResult.message || 'Generation is still processing. Check your Library in a moment.'}
          </p>
        </div>
      )
    }

    const isMultiple = allOutputUrls.length > 1

    return (
      <div className="mt-3">
        {/* Multiple images grid */}
        {isMultiple ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 max-w-lg">
              {allOutputUrls.map((url, index) => {
                const isVideo = isVideoUrl(url)
                return (
                  <div key={index} className="relative group rounded-xl overflow-hidden border border-white/[0.1] hover:border-skinny-yellow/30 transition-colors">
                    {isVideo ? (
                      <video
                        src={url}
                        className="w-full h-auto"
                        controls
                        muted
                        playsInline
                      />
                    ) : (
                      <SmartImage
                        src={url}
                        alt={`${effectiveResult.prompt} - ${index + 1}`}
                        className="w-full h-auto"
                      />
                    )}
                    {/* Image number badge */}
                    <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white/80 text-[10px] font-medium">
                      {index + 1}/{allOutputUrls.length}
                    </span>
                    {/* Individual action buttons */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Reference & Edit buttons - only for images, not videos */}
                      {!isVideoUrl(url) && (
                        <>
                          <button
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('chat-add-attachment', {
                                detail: { url, purpose: 'reference', name: `Reference from ${model}` }
                              }))
                            }}
                            className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors"
                            title="Use as reference in chat"
                          >
                            <MessageSquarePlus size={12} />
                          </button>
                          <button
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('chat-add-attachment', {
                                detail: { url, purpose: 'edit_target', name: `Edit ${model} output` }
                              }))
                            }}
                            className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors"
                            title="Edit this image"
                          >
                            <Pencil size={12} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDownload(url)}
                        className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors"
                        title="Download"
                      >
                        <Download size={12} />
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Shared actions for all images */}
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white/80 text-[10px] font-medium">
                {model}
              </span>
              <span className="px-2 py-1 rounded-full bg-skinny-yellow/20 text-skinny-yellow text-[10px] font-medium">
                {allOutputUrls.length} images
              </span>
              <button
                onClick={handleSaveToLibrary}
                disabled={isAlreadySaved || isSaved}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
                  isAlreadySaved || isSaved
                    ? "bg-skinny-yellow/20 text-skinny-yellow"
                    : "bg-white/[0.05] text-white/60 hover:text-skinny-yellow hover:bg-white/[0.1]"
                )}
              >
                <Bookmark size={10} fill={isAlreadySaved || isSaved ? "currentColor" : "none"} />
                {isAlreadySaved || isSaved ? "Saved" : "Save All"}
              </button>
            </div>
          </div>
        ) : (
          // Single image display (original layout)
          <div className="relative group rounded-xl overflow-hidden border border-white/[0.1] hover:border-skinny-yellow/30 transition-colors">
            {isVideoUrl(effectiveResult.imageUrl) ? (
              <video
                src={effectiveResult.imageUrl}
                className="w-full max-w-md h-auto"
                controls
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <SmartImage
                src={effectiveResult.imageUrl}
                alt={effectiveResult.prompt}
                className="w-full max-w-md h-auto"
              />
            )}
            {/* Model badge + Video indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1">
              <span className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white/80 text-[10px] font-medium">
                {model}
              </span>
              {isVideoUrl(effectiveResult.imageUrl) && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/60 backdrop-blur-sm text-white text-[10px] font-medium">
                  <Video size={10} />
                  Video
                </span>
              )}
            </div>
            {/* Action buttons - visible on hover */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Reference & Edit buttons - only for images, not videos */}
              {!isVideoUrl(effectiveResult.imageUrl) && (
                <>
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('chat-add-attachment', {
                        detail: { url: effectiveResult.imageUrl, purpose: 'reference', name: `Reference from ${model}` }
                      }))
                    }}
                    className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors"
                    title="Use as reference in chat"
                  >
                    <MessageSquarePlus size={14} />
                  </button>
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('chat-add-attachment', {
                        detail: { url: effectiveResult.imageUrl, purpose: 'edit_target', name: `Edit ${model} output` }
                      }))
                    }}
                    className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors"
                    title="Edit this image"
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
              <button
                onClick={handleSaveToLibrary}
                disabled={isAlreadySaved || isSaved}
                className={cn(
                  "p-2 rounded-lg bg-black/60 backdrop-blur-sm transition-colors",
                  isAlreadySaved || isSaved
                    ? "text-skinny-yellow"
                    : "text-white/80 hover:text-skinny-yellow hover:bg-black/80"
                )}
                title={isAlreadySaved || isSaved ? "Saved to Library" : "Save to Library"}
              >
                <Bookmark size={14} fill={isAlreadySaved || isSaved ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => handleDownload()}
                disabled={isDownloading}
                className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors disabled:opacity-50"
                title={isVideoUrl(effectiveResult.imageUrl) ? "Download video" : "Download image"}
              >
                {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              </button>
              <a
                href={effectiveResult.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:text-skinny-yellow hover:bg-black/80 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-white/30 italic">"{effectiveResult.prompt}"</p>

        {/* Reference images used in this generation */}
        {effectiveResult.referenceImages && effectiveResult.referenceImages.length > 0 && (
          <ReferenceImagesCollapsible referenceImages={effectiveResult.referenceImages} />
        )}
      </div>
    )
  }

  return null
}

// Collapsible reference images section
function ReferenceImagesCollapsible({ referenceImages }: { referenceImages: Array<{ url: string; purpose: string }> }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="mt-3 pt-2 border-t border-white/[0.05]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white/60 transition-colors"
      >
        <ChevronRight
          size={12}
          className={cn("transition-transform", isExpanded && "rotate-90")}
        />
        <ImageIcon size={12} />
        <span>{referenceImages.length} reference image{referenceImages.length > 1 ? 's' : ''} used</span>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mt-2 flex-wrap">
              {referenceImages.map((img, idx) => (
                <div
                  key={idx}
                  className="w-12 h-12 rounded-lg overflow-hidden border border-white/[0.1] bg-white/[0.03]"
                >
                  <img
                    src={img.url}
                    alt={`Reference ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Attachment previews
function AttachmentPreviews({ attachments }: { attachments: ChatAttachment[] }) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  if (attachments.length === 0) return null

  // Count all image-type attachments (both 'image' for local and 'reference' for Skinny Hub)
  const imageCount = attachments.filter(a => a.type === 'image' || a.type === 'reference').length
  const isSingleImage = imageCount === 1

  return (
    <>
      <div className={cn(
        "flex flex-wrap gap-2 mb-2",
        isSingleImage && "max-w-xs"
      )}>
        {attachments.map((attachment) => {
          // Both 'image' (local upload) and 'reference' (Skinny Hub) should display as images
          const isImageType = attachment.type === 'image' || attachment.type === 'reference'

          return (
            <div
              key={attachment.id}
              className={cn(
                "relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-800 cursor-pointer hover:border-zinc-500 transition-colors",
                isSingleImage ? "w-full aspect-auto max-h-48" : "w-16 h-16"
              )}
              onClick={() => setExpandedImage(attachment.url)}
            >
              {isImageType && attachment.url ? (
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className={cn(
                    "object-cover",
                    isSingleImage ? "w-full h-full max-h-48 object-contain" : "w-full h-full"
                  )}
                  onError={(e) => {
                    // Fallback to icon if image fails to load
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.parentElement?.classList.add('flex', 'items-center', 'justify-center')
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon size={20} className="text-zinc-500" />
                </div>
              )}
              {/* Purpose badge */}
              {attachment.purpose && (
                <span className="absolute bottom-0 left-0 right-0 text-[8px] bg-black/80 text-white/90 px-1 py-0.5 text-center truncate">
                  {attachment.purpose === 'edit_target' ? 'Edit' :
                   attachment.purpose === 'starting_frame' ? 'Start' :
                   attachment.purpose === 'last_frame' ? 'End' : 'Ref'}
                </span>
              )}
            </div>
          )
        })}
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

export const ChatMessage = memo(function ChatMessage({ message, onQuickGenerate, onEditPrompt, showQuickActions, pendingReferenceImages }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)
  const [showSkillModal, setShowSkillModal] = useState(false)
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const { savePrompt } = useSavedPrompts()

  // Editable reference images - allows users to add/remove before clicking Generate
  const [editableRefs, setEditableRefs] = useState<ChatAttachment[]>(pendingReferenceImages || [])
  const [showImagePicker, setShowImagePicker] = useState(false)

  // Sync when pendingReferenceImages changes (e.g., when message re-renders)
  useEffect(() => {
    if (pendingReferenceImages) {
      setEditableRefs(pendingReferenceImages)
    }
  }, [pendingReferenceImages])

  // Handlers for editing reference images
  const handleRemoveRef = useCallback((idToRemove: string) => {
    setEditableRefs(prev => prev.filter(ref => ref.id !== idToRemove))
  }, [])

  const handleAddRef = useCallback((newAttachment: ChatAttachment) => {
    setEditableRefs(prev => [...prev, newAttachment])
    setShowImagePicker(false)
  }, [])

  // Detect if this is a confirmation/cost estimate message
  // Look for patterns like "Estimated cost:" or "Ready to create" or cost estimates
  const isConfirmationMessage = useMemo(() => {
    if (!isAssistant || !message.content || message.generation || message.isStreaming) return false
    const content = message.content.toLowerCase()
    // Check for cost estimate patterns
    return (
      content.includes('estimated cost') ||
      content.includes('ready to create') ||
      content.includes('ready to generate') ||
      (content.includes('$0.') && (content.includes('does this') || content.includes('look good') || content.includes('shall i')))
    )
  }, [isAssistant, message.content, message.generation, message.isStreaming])

  // Get skills for highlighting
  const { state: skillsState } = useSkills()
  const allSkills = skillsState.skills

  // Strip generation blocks from display content (only for assistant messages)
  const displayContent = useMemo(() => {
    if (isAssistant && message.content) {
      return stripGenerationBlock(message.content)
    }
    return message.content
  }, [message.content, isAssistant])

  // Check if content contains @mentions worth highlighting
  const hasSkillMentions = useMemo(() => {
    return displayContent && /@[\w-]+/.test(displayContent)
  }, [displayContent])

  const copyContent = useCallback(async () => {
    try {
      // Copy the display content (without generation blocks)
      await navigator.clipboard.writeText(displayContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [displayContent])

  // Detect if this message contains a saveable prompt (assistant responses with substantial content)
  const isSaveablePrompt = useMemo(() => {
    if (!isAssistant || !displayContent || message.isStreaming) return false
    // Must have at least 50 chars of content to be worth saving
    return displayContent.length >= 50
  }, [isAssistant, displayContent, message.isStreaming])

  // Save the prompt to the user's library
  const handleSavePrompt = useCallback(async () => {
    if (!displayContent || promptSaved) return

    try {
      const saved = await savePrompt({
        prompt: displayContent,
        category: 'general',
      })

      if (saved) {
        setPromptSaved(true)
        toast.success('Prompt saved to library!', {
          description: 'Find it in your Library under Saved Prompts',
        })
      } else {
        toast.error('Failed to save prompt')
      }
    } catch (err) {
      console.error('Failed to save prompt:', err)
      toast.error('Failed to save prompt')
    }
  }, [displayContent, promptSaved, savePrompt])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
        mass: 0.8
      }}
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
              ? "bg-skinny-yellow/20 backdrop-blur-sm border border-skinny-yellow/40 text-white rounded-tr-sm shadow-[0_0_15px_rgba(214,252,81,0.15)]"
              : "backdrop-blur-sm bg-white/[0.03] border border-white/[0.06] text-white/90 rounded-tl-sm"
          )}
        >
          {/* Text Content */}
          {displayContent && (
            <div className={cn(
              "text-sm break-words prose prose-sm max-w-none prose-p:my-1 prose-p:leading-relaxed",
              isUser
                ? "prose-p:text-white prose-strong:text-skinny-yellow prose-em:text-white/80"
                : "prose-invert prose-strong:text-skinny-yellow prose-strong:font-semibold prose-em:text-white/70 prose-code:text-skinny-yellow prose-code:bg-white/[0.05] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-white/[0.03] prose-pre:border prose-pre:border-white/[0.08] prose-ul:my-2 prose-li:my-0.5 prose-headings:text-white prose-headings:font-medium"
            )}>
              <ReactMarkdown
                components={{
                  // Custom text renderer to highlight @skill mentions
                  p: ({ children, ...props }) => {
                    // Process children to find and highlight @mentions
                    const processChildren = (child: React.ReactNode): React.ReactNode => {
                      if (typeof child === 'string' && /@[\w-]+/.test(child)) {
                        return renderWithSkillHighlights(child, allSkills)
                      }
                      if (Array.isArray(child)) {
                        return child.map((c, i) => <span key={i}>{processChildren(c)}</span>)
                      }
                      return child
                    }
                    return <p {...props}>{processChildren(children)}</p>
                  },
                  // Also handle text in list items
                  li: ({ children, ...props }) => {
                    const processChildren = (child: React.ReactNode): React.ReactNode => {
                      if (typeof child === 'string' && /@[\w-]+/.test(child)) {
                        return renderWithSkillHighlights(child, allSkills)
                      }
                      return child
                    }
                    return <li {...props}>{processChildren(children)}</li>
                  },
                }}
              >
                {displayContent}
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

          {/* Director's Notes - appears after generations */}
          {message.directorsNotes && <DirectorsNotesDisplay notes={message.directorsNotes} />}

          {/* Action buttons (assistant only) */}
          {isAssistant && displayContent && !message.isStreaming && (
            <div className="absolute -bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
              {/* Save as Skill button */}
              {isSaveablePrompt && (
                <button
                  onClick={() => setShowSkillModal(true)}
                  className="p-1.5 rounded-lg backdrop-blur-sm bg-black/60 border border-white/[0.08] text-white/40 hover:text-skinny-yellow hover:border-skinny-yellow/30 shadow-lg transition-all"
                  title="Save as Skill"
                >
                  <Sparkles size={12} />
                </button>
              )}
              {/* Save prompt button */}
              {isSaveablePrompt && (
                <button
                  onClick={handleSavePrompt}
                  disabled={promptSaved}
                  className={cn(
                    "p-1.5 rounded-lg backdrop-blur-sm border shadow-lg transition-all",
                    promptSaved
                      ? "bg-skinny-yellow/20 border-skinny-yellow/30 text-skinny-yellow"
                      : "bg-black/60 border-white/[0.08] text-white/40 hover:text-skinny-yellow hover:border-skinny-yellow/30"
                  )}
                  title={promptSaved ? "Prompt saved" : "Save prompt to library"}
                >
                  {promptSaved ? <Check size={12} /> : <Save size={12} />}
                </button>
              )}
              {/* Copy button */}
              <button
                onClick={copyContent}
                className="p-1.5 rounded-lg backdrop-blur-sm bg-black/60 border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20 shadow-lg transition-all"
                title="Copy message"
              >
                {copied ? <Check size={12} className="text-skinny-yellow" /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>

        {/* Quick Action Buttons for confirmation messages */}
        {isConfirmationMessage && showQuickActions && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 space-y-2"
          >
            {/* Interactive reference images - can add/remove before generating */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <ImageIcon size={14} className="text-skinny-yellow shrink-0" />
              <span className="text-[11px] text-white/50">
                {editableRefs.length > 0 ? 'References:' : 'No references'}
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {editableRefs.map((img) => (
                  <div
                    key={img.id}
                    className="relative group w-10 h-10"
                    title={img.name || 'Reference image'}
                  >
                    <div className="w-full h-full rounded-md overflow-hidden border border-white/[0.1] bg-zinc-800">
                      <img
                        src={img.url}
                        alt={img.name || 'Reference'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* Remove button - appears on hover */}
                    <button
                      onClick={() => handleRemoveRef(img.id)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      title="Remove reference"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {/* Add button with file input */}
                <label
                  className="w-10 h-10 rounded-md border border-dashed border-white/20 flex items-center justify-center hover:border-skinny-lime/50 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  title="Add reference image"
                >
                  <Plus size={16} className="text-white/40" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return

                      // Create a URL for the file and add as attachment
                      const url = URL.createObjectURL(file)
                      const newAttachment: ChatAttachment = {
                        id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: 'reference',
                        url,
                        name: file.name,
                        purpose: 'reference',
                        file,
                        mimeType: file.type,
                      }
                      handleAddRef(newAttachment)

                      // Reset input so same file can be selected again
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onQuickGenerate?.(editableRefs.length > 0 ? editableRefs : undefined)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-skinny-yellow text-black rounded-lg font-bold text-xs hover:bg-skinny-yellow/90 active:scale-95 transition-all shadow-lg shadow-skinny-yellow/20"
              >
                <Play size={14} className="fill-current" />
                Generate{editableRefs.length > 0 ? ` (${editableRefs.length} ref${editableRefs.length > 1 ? 's' : ''})` : ''}
              </button>
              <button
                onClick={onEditPrompt}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg font-medium text-xs hover:bg-zinc-700 hover:text-white active:scale-95 transition-all border border-zinc-700"
              >
                <Pencil size={12} />
                Edit
              </button>
            </div>
          </motion.div>
        )}

        {/* Timestamp */}
        <span className={cn(
          "text-[10px] text-zinc-600 mt-1 block",
          isUser ? "text-right" : "text-left"
        )}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Save as Skill Modal */}
      <SaveSkillModal
        isOpen={showSkillModal}
        onClose={() => setShowSkillModal(false)}
        initialContent={displayContent}
        onSuccess={() => {
          toast.success('Skill created!', {
            description: 'You can now use it with @shortcut in your prompts',
          })
        }}
      />
    </motion.div>
  )
})
