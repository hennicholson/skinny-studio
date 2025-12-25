'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Loader2, Image as ImageIcon, X, ImageOff, Wand2, ChevronDown, SendIcon, Paperclip, Zap, MessageSquare, Sparkles } from 'lucide-react'
import { ChatAttachment, ImagePurpose, IMAGE_PURPOSE_LABELS } from '@/lib/context/chat-context'
import { validateImage, createThumbnailUrl, revokeThumbnailUrl } from '@/lib/image-utils'
import { selectedModelSupportsVision, getSelectedModel } from '@/lib/api-settings'
import { ModelSelector } from '@/components/ui/model-selector'
import { ImageSourcePicker } from './image-source-picker'
import { ImagePurposeModal } from './image-purpose-modal'
import { AnalysisPreviewModal } from './analysis-preview-modal'
import { useApp } from '@/lib/context/app-context'
import { useSkills, INTENT_SKILL_MAP } from '@/lib/context/skills-context'
import { Skill } from '@/lib/types'
import { SkillSuggestions, extractIntentKeywords } from './skill-suggestions'

interface ChatInputProps {
  onSend: (content: string, attachments?: ChatAttachment[], selectedGenerationModelId?: string) => void
  isLoading?: boolean
  placeholder?: string
  /** Pass conversationId/sessionId to clear attachments on switch */
  contextId?: string | null
}

const MAX_IMAGES = 4
const MAX_CHARS = 4000

export function ChatInput({
  onSend,
  isLoading = false,
  placeholder = "Chat with your creative AI...",
  contextId,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const [supportsVision, setSupportsVision] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)

  // Image purpose modal state
  const [showPurposeModal, setShowPurposeModal] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null)

  // Image analysis state
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [analysisText, setAnalysisText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Skill suggestions state (for @ autocomplete)
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)

  // Proactive skill suggestions state (based on intent detection)
  const [proactiveSuggestions, setProactiveSuggestions] = useState<Skill[]>([])
  const [dismissedSuggestions, setDismissedSuggestions] = useState(false)

  // Get generation models from app context
  const { models, selectedModel, setSelectedModel, recentModels } = useApp()

  // Get skills context
  const { state: skillsState, searchSkills, getActiveSkills, getSkillsByIntent } = useSkills()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check vision support on mount and when settings might change
  useEffect(() => {
    setSupportsVision(selectedModelSupportsVision())
    // Re-check when window focuses (user might have changed model in settings)
    const handleFocus = () => setSupportsVision(selectedModelSupportsVision())
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Clear attachments when switching conversations/sessions to prevent stale references
  useEffect(() => {
    // Don't clear on initial mount (when contextId is first set)
    if (contextId !== undefined) {
      setAttachments(prev => {
        // Revoke URLs to free memory
        prev.forEach(a => revokeThumbnailUrl(a.url))
        return []
      })
    }
  }, [contextId])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [value])

  // Cleanup attachment URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach(a => revokeThumbnailUrl(a.url))
    }
  }, [])

  // Proactive skill suggestions based on intent detection (debounced)
  useEffect(() => {
    // Skip if user dismissed or if already showing @ autocomplete
    if (dismissedSuggestions || showSkillSuggestions) {
      setProactiveSuggestions([])
      return
    }

    // Skip if input is too short
    if (value.length < 10) {
      setProactiveSuggestions([])
      return
    }

    // Check if user already has @mentions (they know about skills)
    if (value.includes('@')) {
      setProactiveSuggestions([])
      return
    }

    // Debounce the detection
    const timer = setTimeout(() => {
      const keywords = extractIntentKeywords(value)

      // Find matching skills for detected intents
      const matchedSkills = new Map<string, Skill>()

      for (const keyword of keywords) {
        // Check if keyword matches any intent in the map
        if (INTENT_SKILL_MAP[keyword]) {
          const skills = getSkillsByIntent(keyword)
          for (const skill of skills) {
            if (!matchedSkills.has(skill.id)) {
              matchedSkills.set(skill.id, skill)
            }
          }
        }
      }

      // Convert to array and limit to top 4
      const suggestions = Array.from(matchedSkills.values()).slice(0, 4)
      setProactiveSuggestions(suggestions)
    }, 400)

    return () => clearTimeout(timer)
  }, [value, dismissedSuggestions, showSkillSuggestions, getSkillsByIntent])

  // Reset dismissed state when input changes significantly
  useEffect(() => {
    if (value.length < 5) {
      setDismissedSuggestions(false)
    }
  }, [value])

  // Handle inserting proactive skill suggestion
  const insertProactiveSkill = useCallback((skill: Skill) => {
    // Add the @shortcut to the beginning or end of the current text
    const newText = value.trim()
      ? `@${skill.shortcut} ${value}`
      : `@${skill.shortcut} `

    setValue(newText)
    setProactiveSuggestions([])
    setDismissedSuggestions(true)

    // Focus textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        const newPos = newText.length
        textareaRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }, [value])

  // Dismiss proactive suggestions
  const dismissProactiveSuggestions = useCallback(() => {
    setProactiveSuggestions([])
    setDismissedSuggestions(true)
  }, [])

  // Handle clipboard paste for images
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()

        const file = item.getAsFile()
        if (!file) continue

        if (attachments.length >= MAX_IMAGES) {
          // Max images reached, ignore paste
          return
        }

        const validation = validateImage(file)
        if (!validation.valid) {
          // Invalid image, ignore
          return
        }

        const url = createThumbnailUrl(file)
        const newAttachment: ChatAttachment = {
          id: `paste_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'image',
          url,
          name: `Pasted Image ${attachments.length + 1}`,
          file,
        }

        setPendingAttachment(newAttachment)
        setShowPurposeModal(true)
        return // Only handle first image
      }
    }
  }, [attachments.length])

  // Register paste event listener
  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  // Listen for external add-attachment events (from generation cards)
  useEffect(() => {
    const handleAddAttachment = (e: CustomEvent<{ url: string; purpose: ImagePurpose; name?: string }>) => {
      if (attachments.length >= MAX_IMAGES) return

      const { url, purpose, name } = e.detail
      const newAttachment: ChatAttachment = {
        id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'image',
        url,
        name: name || 'Referenced Image',
        purpose,
      }
      setAttachments(prev => [...prev, newAttachment])

      // Focus the textarea so user can type their prompt
      setTimeout(() => textareaRef.current?.focus(), 100)
    }

    window.addEventListener('chat-add-attachment', handleAddAttachment as EventListener)
    return () => window.removeEventListener('chat-add-attachment', handleAddAttachment as EventListener)
  }, [attachments.length])

  // Detect @ for skill suggestions - show all skills, not just active ones
  const filteredSkills = useCallback(() => {
    if (!showSkillSuggestions) return []
    if (!skillsState.isLoaded) return []
    // Use all skills for autocomplete, not just active - users should see all available skills
    const allSkills = skillsState.skills
    if (!skillQuery) return allSkills.slice(0, 8)
    return allSkills
      .filter(s =>
        s.shortcut?.toLowerCase().includes(skillQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(skillQuery.toLowerCase())
      )
      .slice(0, 8)
  }, [showSkillSuggestions, skillQuery, skillsState.isLoaded, skillsState.skills])

  // Handle input change with @ detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursor = e.target.selectionStart || 0
    setValue(newValue)
    setCursorPosition(cursor)

    // Check if we're typing after an @
    const textBeforeCursor = newValue.slice(0, cursor)
    const atMatch = textBeforeCursor.match(/@([\w-]*)$/)

    if (atMatch) {
      setSkillQuery(atMatch[1])
      setShowSkillSuggestions(true)
      setSelectedSkillIndex(0)
    } else {
      setShowSkillSuggestions(false)
      setSkillQuery('')
    }
  }, [])

  // Insert skill shortcut
  const insertSkill = useCallback((skill: Skill) => {
    const textBeforeCursor = value.slice(0, cursorPosition)
    const textAfterCursor = value.slice(cursorPosition)

    // Find the @ symbol to replace from
    const atIndex = textBeforeCursor.lastIndexOf('@')
    if (atIndex === -1) return

    const newText = textBeforeCursor.slice(0, atIndex) + `@${skill.shortcut} ` + textAfterCursor
    setValue(newText)
    setShowSkillSuggestions(false)
    setSkillQuery('')

    // Focus textarea and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = atIndex + (skill.shortcut?.length || 0) + 2
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }, [value, cursorPosition])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle skill suggestions navigation
    if (showSkillSuggestions) {
      const skills = filteredSkills()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSkillIndex(prev => Math.min(prev + 1, skills.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSkillIndex(prev => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && skills.length > 0)) {
        e.preventDefault()
        if (skills[selectedSkillIndex]) {
          insertSkill(skills[selectedSkillIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        setShowSkillSuggestions(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = useCallback(() => {
    if (!value.trim() && attachments.length === 0) return
    if (isLoading) return
    if (value.length > MAX_CHARS) return

    // Pass the selected generation model ID
    onSend(value.trim(), attachments.length > 0 ? attachments : undefined, selectedModel.id)
    setValue('')
    setAttachments([])

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, attachments, isLoading, onSend, selectedModel.id])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return

    const files = Array.from(e.target.files)

    for (const file of files) {
      if (attachments.length >= MAX_IMAGES) break

      const validation = validateImage(file)
      if (validation.valid) {
        const url = createThumbnailUrl(file)
        const newAttachment: ChatAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'image',
          url,
          name: file.name,
          file,
        }
        // Open purpose modal for this attachment
        setPendingAttachment(newAttachment)
        setShowPurposeModal(true)
        setShowImagePicker(false)
        break // Only handle one at a time for purpose selection
      }
    }

    e.target.value = ''
  }

  // Analyze image with Gemini
  const analyzeImage = useCallback(async (attachment: ChatAttachment) => {
    setIsAnalyzing(true)
    setAnalysisText('')

    try {
      // Build request body
      const body: Record<string, any> = {
        purpose: 'analyze',
      }

      // If we have a file, convert to base64
      if (attachment.file) {
        const reader = new FileReader()
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string
            const base64 = result.split(',')[1]
            resolve(base64)
          }
          reader.onerror = reject
        })
        reader.readAsDataURL(attachment.file)
        body.base64 = await base64Promise
        body.mimeType = attachment.file.type
      } else {
        body.imageUrl = attachment.url
      }

      // Get auth headers from localStorage
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) headers['x-whop-user-token'] = devToken
        if (devUserId) headers['x-whop-user-id'] = devUserId
      }

      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error('Analysis failed')
      }

      const data = await response.json()
      setAnalysisText(data.analysis || 'No analysis generated.')
    } catch (error) {
      console.error('Image analysis error:', error)
      setAnalysisText('Failed to analyze image. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  // Handle purpose selection from modal
  const handlePurposeSelected = useCallback((purpose: ImagePurpose) => {
    if (!pendingAttachment) return

    if (purpose === 'analyze') {
      // Start analysis flow
      setShowPurposeModal(false)
      setShowAnalysisModal(true)
      analyzeImage(pendingAttachment)
    } else {
      // Direct attachment without analysis
      setAttachments(prev => [...prev, { ...pendingAttachment, purpose }])
      setPendingAttachment(null)
      setShowPurposeModal(false)
    }
  }, [pendingAttachment, analyzeImage])

  // Handle analysis modal confirm (user selects final purpose after analysis)
  const handleAnalysisConfirm = useCallback((finalPurpose: ImagePurpose) => {
    if (pendingAttachment) {
      setAttachments(prev => [...prev, {
        ...pendingAttachment,
        purpose: finalPurpose,
        analysis: analysisText,
        analysisStatus: 'complete',
      }])
      setPendingAttachment(null)
      setShowAnalysisModal(false)
      setAnalysisText('')
    }
  }, [pendingAttachment, analysisText])

  // Handle re-analyze from analysis modal
  const handleReanalyze = useCallback(() => {
    if (pendingAttachment) {
      analyzeImage(pendingAttachment)
    }
  }, [pendingAttachment, analyzeImage])

  // Handle analysis modal close
  const handleAnalysisModalClose = useCallback(() => {
    // Go back to purpose modal so user can choose again
    setShowAnalysisModal(false)
    setAnalysisText('')
    setShowPurposeModal(true)
  }, [])

  // Handle closing purpose modal without selection (cancel)
  const handlePurposeModalClose = () => {
    if (pendingAttachment) {
      // Clean up the URL if user cancels
      revokeThumbnailUrl(pendingAttachment.url)
      setPendingAttachment(null)
    }
    setShowPurposeModal(false)
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id)
      if (attachment) {
        revokeThumbnailUrl(attachment.url)
      }
      return prev.filter(a => a.id !== id)
    })
  }

  const canSend = (value.trim() || attachments.length > 0) && !isLoading && value.length <= MAX_CHARS

  return (
    <div className="p-4 pb-safe">
      <div className="max-w-2xl mx-auto">
        {/* Glassmorphism Container - NOTE: overflow-visible needed for skill dropdown to appear above */}
        <motion.div
          className={cn(
            "relative backdrop-blur-2xl bg-white/[0.02] rounded-2xl border shadow-2xl transition-all duration-300",
            isFocused
              ? "border-white/[0.1] shadow-skinny-yellow/5"
              : "border-white/[0.05]"
          )}
        >
          {/* Attachments Preview */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-white/[0.05]"
              >
                <div className="flex gap-2 p-4 flex-wrap">
                  {attachments.map((attachment) => (
                    <motion.div
                      key={attachment.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group"
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/[0.1] bg-white/[0.03]">
                        <img
                          src={attachment.url}
                          alt={attachment.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {/* Purpose Badge */}
                      {attachment.purpose && (
                        <span className="absolute bottom-0 left-0 right-0 text-[8px] bg-black/80 text-white/90 px-1 py-0.5 text-center truncate flex items-center justify-center gap-0.5">
                          {attachment.analysis && <Sparkles size={8} className="text-cyan-400" />}
                          {IMAGE_PURPOSE_LABELS[attachment.purpose]}
                        </span>
                      )}
                      <button
                        onClick={() => removeAttachment(attachment.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X size={10} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Proactive Skill Suggestions */}
          <SkillSuggestions
            suggestedSkills={proactiveSuggestions}
            onSelectSkill={insertProactiveSkill}
            onDismiss={dismissProactiveSuggestions}
          />

          {/* Textarea Area */}
          <div className="p-4 relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setIsFocused(true)
                // Scroll into view when keyboard appears (mobile)
                setTimeout(() => {
                  textareaRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                  })
                }, 100)
              }}
              onBlur={(e) => {
                setIsFocused(false)
                // Delay hiding suggestions to allow click
                setTimeout(() => setShowSkillSuggestions(false), 150)
              }}
              placeholder={placeholder}
              rows={1}
              aria-label="Chat message"
              enterKeyHint="send"
              autoCapitalize="sentences"
              autoCorrect="on"
              className={cn(
                "w-full bg-transparent resize-none focus:outline-none text-sm overflow-y-auto",
                "placeholder:text-white/20 text-white/90"
              )}
              style={{ minHeight: '60px', maxHeight: '200px' }}
            />

            {/* Skill Suggestions Dropdown - Enhanced with Rich Previews */}
            <AnimatePresence>
              {showSkillSuggestions && filteredSkills().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-4 right-4 mb-2 bg-zinc-900/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Skills</span>
                    <span className="text-[10px] text-white/30">Type to filter</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {filteredSkills().map((skill, index) => {
                      // Extract first 2-3 key points from content for preview
                      const contentLines = skill.content?.split('\n').filter(line => line.trim()).slice(0, 3) || []

                      return (
                        <button
                          key={skill.id}
                          onClick={() => insertSkill(skill)}
                          className={cn(
                            "w-full px-3 py-3 flex items-start gap-3 text-left transition-all duration-150 border-b border-white/[0.03] last:border-b-0",
                            index === selectedSkillIndex
                              ? "bg-skinny-yellow/10"
                              : "hover:bg-white/[0.03]"
                          )}
                        >
                          <span className="text-xl flex-shrink-0 mt-0.5">{skill.icon || '📌'}</span>
                          <div className="flex-1 min-w-0">
                            {/* Header row */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "text-sm font-medium",
                                index === selectedSkillIndex ? "text-skinny-yellow" : "text-white"
                              )}>
                                {skill.name}
                              </span>
                              <code className="px-1.5 py-0.5 rounded bg-white/[0.05] text-skinny-yellow text-[10px] font-mono">
                                @{skill.shortcut}
                              </code>
                              {skill.category && (
                                <span className="px-1.5 py-0.5 rounded bg-white/[0.03] text-white/30 text-[9px] uppercase">
                                  {skill.category}
                                </span>
                              )}
                            </div>

                            {/* Description */}
                            <p className="text-[11px] text-white/50 mb-2">{skill.description}</p>

                            {/* Content preview - key techniques */}
                            {contentLines.length > 0 && (
                              <div className="space-y-0.5 mb-2">
                                {contentLines.map((line, i) => {
                                  const cleanLine = line.replace(/^[-•*#]\s*/, '').trim()
                                  if (!cleanLine || cleanLine.length > 60) return null
                                  return (
                                    <p key={i} className="text-[10px] text-white/30 truncate">
                                      • {cleanLine.slice(0, 50)}{cleanLine.length > 50 ? '...' : ''}
                                    </p>
                                  )
                                })}
                              </div>
                            )}

                            {/* Footer with usage stats */}
                            <div className="flex items-center gap-3 text-[9px] text-white/25">
                              {skill.usageCount > 0 && (
                                <span>Used {skill.usageCount}x</span>
                              )}
                              {skill.tags?.length > 0 && (
                                <span className="truncate">{skill.tags.slice(0, 3).join(' • ')}</span>
                              )}
                            </div>
                          </div>

                          {/* Tab hint for selected */}
                          {index === selectedSkillIndex && (
                            <div className="flex-shrink-0 self-center">
                              <kbd className="text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/[0.05]">Tab</kbd>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Footer hint */}
                  <div className="px-3 py-2 border-t border-white/[0.05] bg-white/[0.02]">
                    <p className="text-[10px] text-white/30">
                      <kbd className="text-white/40">↑↓</kbd> navigate • <kbd className="text-white/40">Tab</kbd> select • Skills inject prompt guidance
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Bar */}
          <div className="px-4 py-3 border-t border-white/[0.05] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {/* Model Selector Button */}
              <motion.button
                onClick={() => setShowModelSelector(true)}
                whileTap={{ scale: 0.96 }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all duration-200 relative group",
                  "text-white/50 hover:text-white/90 hover:bg-white/[0.05]"
                )}
                title="Select generation model"
              >
                {selectedModel.category === 'chat' ? (
                  <MessageSquare size={14} className="text-skinny-green" />
                ) : (
                  <Wand2 size={14} className="text-skinny-yellow" />
                )}
                <span className="text-xs font-medium max-w-[100px] truncate hidden sm:inline">{selectedModel.name}</span>
                <ChevronDown size={12} className="text-white/40" />
              </motion.button>

              {/* Attachment Button - Opens image source picker */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleFileChange}
                className="hidden"
                disabled={!supportsVision}
              />
              <motion.button
                onClick={() => setShowImagePicker(true)}
                disabled={attachments.length >= MAX_IMAGES}
                whileTap={{ scale: 0.94 }}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 relative group",
                  attachments.length >= MAX_IMAGES
                    ? "text-white/20 cursor-not-allowed"
                    : "text-white/40 hover:text-white/90 hover:bg-white/[0.05]"
                )}
                title="Add image"
              >
                <Paperclip size={16} />
                <motion.span
                  className="absolute inset-0 bg-white/[0.05] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </motion.button>
            </div>

            {/* Send Button */}
            <motion.button
              onClick={handleSend}
              disabled={!canSend}
              whileHover={{ scale: canSend ? 1.02 : 1 }}
              whileTap={{ scale: canSend ? 0.98 : 1 }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2",
                canSend
                  ? "bg-skinny-yellow text-black shadow-lg shadow-skinny-yellow/20"
                  : "bg-white/[0.05] text-white/40"
              )}
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <SendIcon size={16} />
              )}
              <span>Send</span>
            </motion.button>
          </div>
        </motion.div>

        {/* Footer hints */}
        <div className="flex items-center justify-between mt-3 px-1 text-[11px] sm:text-[10px] text-white/30">
          <span className="hidden sm:inline">
            <kbd className="text-white/40">Enter</kbd> to send • <kbd className="text-white/40">Shift+Enter</kbd> new line • <kbd className="text-skinny-yellow/60">@</kbd> for skills
          </span>
          <span className={cn(
            value.length > MAX_CHARS ? 'text-red-400' : ''
          )}>
            {value.length}/{MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Model Selector Modal */}
      <ModelSelector
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        models={models}
        selectedModelId={selectedModel.id}
        onSelectModel={(modelId) => {
          const model = models.find(m => m.id === modelId)
          if (model) setSelectedModel(model)
        }}
        recentModelIds={recentModels}
        onModelSelected={() => setShowModelSelector(false)}
      />

      {/* Image Source Picker */}
      <ImageSourcePicker
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onSelectLocalFile={() => fileInputRef.current?.click()}
        onSelectImage={(attachment) => {
          if (attachments.length < MAX_IMAGES) {
            // Open purpose modal for hub images too
            setPendingAttachment(attachment)
            setShowPurposeModal(true)
            setShowImagePicker(false)
          }
        }}
        supportsVision={supportsVision}
      />

      {/* Image Purpose Modal */}
      <ImagePurposeModal
        isOpen={showPurposeModal}
        onClose={handlePurposeModalClose}
        onSelect={handlePurposeSelected}
        imageUrl={pendingAttachment?.url || ''}
        imageName={pendingAttachment?.name || ''}
      />

      {/* Analysis Preview Modal */}
      <AnalysisPreviewModal
        isOpen={showAnalysisModal}
        onClose={handleAnalysisModalClose}
        onConfirm={handleAnalysisConfirm}
        onReanalyze={handleReanalyze}
        imageUrl={pendingAttachment?.url || ''}
        imageName={pendingAttachment?.name || ''}
        analysis={analysisText}
        isLoading={isAnalyzing}
      />
    </div>
  )
}
