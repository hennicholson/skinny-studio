'use client'

import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Sparkles, AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSkills } from '@/lib/context/skills-context'
import { SkillCategory } from '@/lib/types'
import { toast } from 'sonner'

interface SaveSkillModalProps {
  isOpen: boolean
  onClose: () => void
  initialContent?: string
  onSuccess?: (skillId: string) => void
}

const CATEGORY_OPTIONS: Array<{
  value: SkillCategory
  label: string
  description: string
  icon: string
}> = [
  { value: 'technique', label: 'Technique', description: 'Prompting methods & approaches', icon: '🎯' },
  { value: 'style', label: 'Style', description: 'Visual aesthetics & looks', icon: '🎨' },
  { value: 'workflow', label: 'Workflow', description: 'Multi-step processes', icon: '⚡' },
  { value: 'tool', label: 'Tool', description: 'Model-specific guidance', icon: '🔧' },
  { value: 'custom', label: 'Custom', description: 'Your personal skills', icon: '✨' },
]

const ICON_OPTIONS = ['🎯', '🎨', '⚡', '🔧', '✨', '📸', '🎬', '🖼️', '💡', '🌟', '🎭', '🎪', '🔮', '💎', '🚀']

export function SaveSkillModal({
  isOpen,
  onClose,
  initialContent = '',
  onSuccess,
}: SaveSkillModalProps) {
  const { addSkill, getSkillByShortcut, state: skillsState } = useSkills()
  const prefersReducedMotion = useReducedMotion()

  // Stable IDs for label/aria wiring.
  const titleId = useId()
  const nameId = useId()
  const shortcutId = useId()
  const shortcutErrId = useId()
  const descriptionId = useId()
  const categoryId = useId()
  const contentId = useId()
  const contentHintId = useId()
  const tagsId = useId()

  const dialogRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SkillCategory>('custom')
  const [content, setContent] = useState(initialContent)
  const [icon, setIcon] = useState('✨')
  const [tags, setTags] = useState('')

  // Validation state
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  // Reset form when modal opens with new content
  useEffect(() => {
    if (isOpen) {
      setContent(initialContent)
      setName('')
      setShortcut('')
      setDescription('')
      setCategory('custom')
      setIcon('✨')
      setTags('')
      setShortcutError(null)
      setShowErrors(false)
    }
  }, [isOpen, initialContent])

  // Auto-generate shortcut from name
  useEffect(() => {
    if (name && !shortcut) {
      const autoShortcut = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 20)
      setShortcut(autoShortcut)
    }
  }, [name])

  // Body scroll lock while modal is open.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // Focus management — capture previous, restore on close, focus first
  // field on open.
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = (document.activeElement as HTMLElement) || null
      const raf = requestAnimationFrame(() => firstFieldRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    } else if (previousFocus.current) {
      previousFocus.current.focus?.()
      previousFocus.current = null
    }
  }, [isOpen])

  // Validate shortcut
  const validateShortcut = useCallback((value: string) => {
    if (!value) {
      setShortcutError('Shortcut is required')
      return false
    }

    if (!/^[a-z0-9-]+$/.test(value)) {
      setShortcutError('Only lowercase letters, numbers, and hyphens allowed')
      return false
    }

    if (value.length < 2) {
      setShortcutError('Shortcut must be at least 2 characters')
      return false
    }

    if (value.length > 30) {
      setShortcutError('Shortcut must be 30 characters or less')
      return false
    }

    // Check for conflicts
    const existing = getSkillByShortcut(value)
    if (existing) {
      setShortcutError(`"@${value}" is already used by "${existing.name}"`)
      return false
    }

    setShortcutError(null)
    return true
  }, [getSkillByShortcut])

  // Handle shortcut change
  const handleShortcutChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setShortcut(cleaned)
    if (cleaned) {
      validateShortcut(cleaned)
    } else {
      setShortcutError(null)
    }
  }

  // Handle save
  const handleSave = useCallback(() => {
    setShowErrors(true)
    // Validate all fields
    if (!name.trim() || !validateShortcut(shortcut) || !content.trim()) {
      toast.error('Fill in name, shortcut, and skill content before saving.')
      return
    }

    setIsSaving(true)

    try {
      const skillId = addSkill({
        name: name.trim(),
        shortcut: shortcut.trim(),
        description: description.trim() || `Custom skill: ${name}`,
        category,
        icon,
        content: content.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        isBuiltIn: false,
        isActive: true,
      })

      toast.success(`Saved "@${shortcut.trim()}"`)
      onSuccess?.(skillId)
      onClose()
    } catch (error) {
      console.error('Failed to save skill:', error)
      toast.error('Could not save skill. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }, [name, shortcut, description, category, icon, content, tags, addSkill, validateShortcut, onSuccess, onClose])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSave()
    }
  }, [isOpen, onClose, handleSave])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Focus-trap on Tab.
  useEffect(() => {
    if (!isOpen) return
    const node = dialogRef.current
    if (!node) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    node.addEventListener('keydown', handler)
    return () => node.removeEventListener('keydown', handler)
  }, [isOpen])

  const canSave = name.trim() && shortcut.trim() && content.trim() && !shortcutError && !isSaving
  const nameInvalid = showErrors && !name.trim()
  const contentInvalid = showErrors && !content.trim()

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-default"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              'relative w-full sm:max-w-lg',
              'max-h-[92dvh] sm:max-h-[88vh]',
              'rounded-t-2xl sm:rounded-2xl',
              'bg-zinc-900 border border-white/[0.06] shadow-2xl',
              'flex flex-col overflow-hidden'
            )}
          >
            {/* Drag handle (mobile) */}
            <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-skinny-yellow" aria-hidden />
                <h2 id={titleId} className="text-white font-semibold">Save as skill</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-lg hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
              >
                <X size={18} className="text-zinc-400" aria-hidden />
              </button>
            </div>

            {/* Form (scrollable) */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4 sm:p-5 space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor={nameId} className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Skill name <span className="text-skinny-yellow" aria-hidden>*</span>
                    <span className="sr-only">(required)</span>
                  </label>
                  <input
                    id={nameId}
                    ref={firstFieldRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Cinematic Lighting"
                    aria-required="true"
                    aria-invalid={nameInvalid || undefined}
                    className={cn(
                      'w-full px-3 py-2.5 bg-white/[0.03] border rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none transition-colors',
                      nameInvalid
                        ? 'border-red-500/50 focus:border-red-500'
                        : 'border-white/[0.08] focus:border-skinny-yellow/50'
                    )}
                  />
                </div>

                {/* Shortcut */}
                <div>
                  <label htmlFor={shortcutId} className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Shortcut <span className="text-skinny-yellow" aria-hidden>*</span>
                    <span className="sr-only">(required)</span>
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-skinny-yellow pointer-events-none"
                      aria-hidden
                    >
                      @
                    </span>
                    <input
                      id={shortcutId}
                      type="text"
                      value={shortcut}
                      onChange={(e) => handleShortcutChange(e.target.value)}
                      placeholder="cinematic-lighting"
                      aria-required="true"
                      aria-invalid={!!shortcutError || undefined}
                      aria-describedby={shortcutError ? shortcutErrId : undefined}
                      className={cn(
                        'w-full pl-7 pr-9 py-2.5 bg-white/[0.03] border rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none transition-colors',
                        shortcutError
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-white/[0.08] focus:border-skinny-yellow/50'
                      )}
                    />
                    {shortcut && !shortcutError && (
                      <Check
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400"
                        aria-hidden
                      />
                    )}
                  </div>
                  {shortcutError && (
                    <p
                      id={shortcutErrId}
                      role="alert"
                      className="mt-1.5 text-xs text-red-400 flex items-center gap-1"
                    >
                      <AlertCircle size={12} aria-hidden />
                      {shortcutError}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label htmlFor={descriptionId} className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Description
                  </label>
                  <input
                    id={descriptionId}
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of what this skill does"
                    className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-skinny-yellow/50 transition-colors"
                  />
                </div>

                {/* Category & Icon Row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Category */}
                  <div>
                    <label htmlFor={categoryId} className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Category
                    </label>
                    <select
                      id={categoryId}
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SkillCategory)}
                      className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-skinny-yellow/50 appearance-none cursor-pointer transition-colors"
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.icon} {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Icon */}
                  <div>
                    <span className="block text-xs font-medium text-zinc-300 mb-1.5">Icon</span>
                    <div
                      role="radiogroup"
                      aria-label="Skill icon"
                      className="flex flex-wrap gap-1 p-2 bg-white/[0.03] border border-white/[0.08] rounded-lg max-h-[72px] overflow-y-auto"
                    >
                      {ICON_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          role="radio"
                          aria-checked={icon === emoji}
                          aria-label={`Use ${emoji}`}
                          onClick={() => setIcon(emoji)}
                          className={cn(
                            'min-w-[28px] min-h-[28px] w-7 h-7 rounded flex items-center justify-center text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                            icon === emoji
                              ? 'bg-skinny-yellow/20 ring-1 ring-skinny-yellow'
                              : 'hover:bg-white/[0.08]'
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label htmlFor={contentId} className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Skill content <span className="text-skinny-yellow" aria-hidden>*</span>
                    <span className="sr-only">(required)</span>
                  </label>
                  <textarea
                    id={contentId}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="The prompt guide or instructions for this skill..."
                    rows={6}
                    aria-required="true"
                    aria-invalid={contentInvalid || undefined}
                    aria-describedby={contentHintId}
                    className={cn(
                      'w-full px-3 py-2.5 bg-white/[0.03] border rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none resize-none transition-colors',
                      contentInvalid
                        ? 'border-red-500/50 focus:border-red-500'
                        : 'border-white/[0.08] focus:border-skinny-yellow/50'
                    )}
                  />
                  <p id={contentHintId} className="mt-1.5 text-[11px] text-zinc-500">
                    This content will be injected into your prompts when you use{' '}
                    <span className="font-mono text-skinny-yellow">@{shortcut || 'shortcut'}</span>
                  </p>
                </div>

                {/* Tags */}
                <div>
                  <label htmlFor={tagsId} className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Tags <span className="text-zinc-500 font-normal">(comma separated)</span>
                  </label>
                  <input
                    id={tagsId}
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="lighting, cinematic, film"
                    className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-skinny-yellow/50 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-5 py-3 border-t border-white/[0.05] flex items-center justify-between flex-shrink-0 gap-3">
              <p className="hidden sm:block text-[10px] text-zinc-500">
                <kbd className="text-zinc-400 font-mono">⌘ + Enter</kbd> to save
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className={cn(
                    'inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg text-sm font-semibold transition-all gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                    canSave
                      ? 'bg-skinny-yellow text-black hover:bg-skinny-green active:scale-[0.98]'
                      : 'bg-white/[0.04] text-zinc-500 cursor-not-allowed'
                  )}
                >
                  <Sparkles size={14} aria-hidden />
                  {isSaving ? 'Saving…' : 'Save skill'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
