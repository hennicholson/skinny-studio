'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Loader2, Image as ImageIcon, X, ImageOff, Wand2, ChevronDown, SendIcon, Paperclip, Zap } from 'lucide-react'
import { ChatAttachment } from '@/lib/context/chat-context'
import { validateImage, createThumbnailUrl, revokeThumbnailUrl } from '@/lib/image-utils'
import { selectedModelSupportsVision, getSelectedModel } from '@/lib/api-settings'
import { ModelSelector } from '@/components/ui/model-selector'
import { useApp } from '@/lib/context/app-context'
import { useSkills } from '@/lib/context/skills-context'
import { Skill } from '@/lib/types'

interface ChatInputProps {
  onSend: (content: string, attachments?: ChatAttachment[], selectedGenerationModelId?: string) => void
  isLoading?: boolean
  placeholder?: string
}

const MAX_IMAGES = 4
const MAX_CHARS = 4000

export function ChatInput({
  onSend,
  isLoading = false,
  placeholder = "Chat with your creative AI...",
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const [supportsVision, setSupportsVision] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)

  // Skill suggestions state
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)

  // Get generation models from app context
  const { models, selectedModel, setSelectedModel, recentModels } = useApp()

  // Get skills context
  const { state: skillsState, searchSkills, getActiveSkills } = useSkills()

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

  // Detect @ for skill suggestions
  const filteredSkills = useCallback(() => {
    if (!showSkillSuggestions) return []
    const activeSkills = getActiveSkills()
    if (!skillQuery) return activeSkills.slice(0, 6)
    return activeSkills
      .filter(s =>
        s.shortcut?.toLowerCase().includes(skillQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(skillQuery.toLowerCase())
      )
      .slice(0, 6)
  }, [showSkillSuggestions, skillQuery, getActiveSkills])

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
    const newAttachments: ChatAttachment[] = []

    for (const file of files) {
      if (attachments.length + newAttachments.length >= MAX_IMAGES) break

      const validation = validateImage(file)
      if (validation.valid) {
        const url = createThumbnailUrl(file)
        newAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'image',
          url,
          name: file.name,
          file,
        })
      }
    }

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }

    e.target.value = ''
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
    <div className="p-4">
      <div className="max-w-2xl mx-auto">
        {/* Glassmorphism Container */}
        <motion.div
          className={cn(
            "relative backdrop-blur-2xl bg-white/[0.02] rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300",
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

          {/* Textarea Area */}
          <div className="p-4 relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={(e) => {
                setIsFocused(false)
                // Delay hiding suggestions to allow click
                setTimeout(() => setShowSkillSuggestions(false), 150)
              }}
              placeholder={placeholder}
              rows={1}
              aria-label="Chat message"
              className={cn(
                "w-full bg-transparent resize-none focus:outline-none text-sm overflow-y-auto",
                "placeholder:text-white/20 text-white/90"
              )}
              style={{ minHeight: '60px', maxHeight: '200px' }}
            />

            {/* Skill Suggestions Dropdown */}
            <AnimatePresence>
              {showSkillSuggestions && filteredSkills().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-4 right-4 mb-2 bg-zinc-900 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="px-3 py-2 border-b border-white/[0.05]">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Skills</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredSkills().map((skill, index) => (
                      <button
                        key={skill.id}
                        onClick={() => insertSkill(skill)}
                        className={cn(
                          "w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors",
                          index === selectedSkillIndex
                            ? "bg-skinny-yellow/10"
                            : "hover:bg-white/[0.03]"
                        )}
                      >
                        <span className="text-lg flex-shrink-0">{skill.icon || '📌'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium truncate",
                              index === selectedSkillIndex ? "text-skinny-yellow" : "text-white"
                            )}>
                              {skill.name}
                            </span>
                            <code className="px-1.5 py-0.5 rounded bg-white/[0.05] text-skinny-yellow text-[10px] font-mono">
                              @{skill.shortcut}
                            </code>
                          </div>
                          <p className="text-[11px] text-white/40 truncate">{skill.description}</p>
                        </div>
                        {index === selectedSkillIndex && (
                          <kbd className="text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/[0.05]">Tab</kbd>
                        )}
                      </button>
                    ))}
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
                <Wand2 size={14} className="text-skinny-yellow" />
                <span className="text-xs font-medium max-w-[100px] truncate hidden sm:inline">{selectedModel.name}</span>
                <ChevronDown size={12} className="text-white/40" />
              </motion.button>

              {/* Attachment Button */}
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
                onClick={() => supportsVision && fileInputRef.current?.click()}
                disabled={!supportsVision || attachments.length >= MAX_IMAGES}
                whileTap={{ scale: 0.94 }}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 relative group",
                  !supportsVision
                    ? "text-white/20 cursor-not-allowed"
                    : attachments.length >= MAX_IMAGES
                      ? "text-white/20 cursor-not-allowed"
                      : "text-white/40 hover:text-white/90 hover:bg-white/[0.05]"
                )}
                title={supportsVision ? "Attach images" : "Vision not supported"}
              >
                {supportsVision ? (
                  <Paperclip size={16} />
                ) : (
                  <ImageOff size={16} />
                )}
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
        <div className="flex items-center justify-between mt-3 px-1 text-[10px] text-white/30">
          <span>
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
    </div>
  )
}
