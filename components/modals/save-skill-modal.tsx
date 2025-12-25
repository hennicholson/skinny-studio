'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSkills } from '@/lib/context/skills-context'
import { SkillCategory } from '@/lib/types'

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
    // Validate all fields
    if (!name.trim()) return
    if (!validateShortcut(shortcut)) return
    if (!content.trim()) return

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

      onSuccess?.(skillId)
      onClose()
    } catch (error) {
      console.error('Failed to save skill:', error)
    } finally {
      setIsSaving(false)
    }
  }, [name, shortcut, description, category, icon, content, tags, addSkill, validateShortcut, onSuccess, onClose])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'Escape') {
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

  const canSave = name.trim() && shortcut.trim() && content.trim() && !shortcutError && !isSaving

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto">
              {/* Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-skinny-yellow" />
                  <h3 className="text-white font-semibold">Save as Skill</h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X size={18} className="text-zinc-400" />
                </button>
              </div>

              {/* Form */}
              <div className="p-4 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Skill Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Cinematic Lighting"
                    className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-skinny-yellow/50"
                    autoFocus
                  />
                </div>

                {/* Shortcut */}
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Shortcut *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skinny-yellow">@</span>
                    <input
                      type="text"
                      value={shortcut}
                      onChange={(e) => handleShortcutChange(e.target.value)}
                      placeholder="cinematic-lighting"
                      className={cn(
                        "w-full pl-7 pr-3 py-2 bg-zinc-800/50 border rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none",
                        shortcutError
                          ? "border-red-500/50 focus:border-red-500"
                          : "border-zinc-700 focus:border-skinny-yellow/50"
                      )}
                    />
                    {shortcut && !shortcutError && (
                      <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400" />
                    )}
                  </div>
                  {shortcutError && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {shortcutError}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of what this skill does"
                    className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-skinny-yellow/50"
                  />
                </div>

                {/* Category & Icon Row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Category */}
                  <div>
                    <label className="block text-xs text-white/50 mb-1.5">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SkillCategory)}
                      className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-skinny-yellow/50 appearance-none cursor-pointer"
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
                    <label className="block text-xs text-white/50 mb-1.5">Icon</label>
                    <div className="flex flex-wrap gap-1 p-2 bg-zinc-800/50 border border-zinc-700 rounded-lg max-h-[72px] overflow-y-auto">
                      {ICON_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setIcon(emoji)}
                          className={cn(
                            "w-7 h-7 rounded flex items-center justify-center text-sm transition-all",
                            icon === emoji
                              ? "bg-skinny-yellow/20 ring-1 ring-skinny-yellow"
                              : "hover:bg-zinc-700"
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
                  <label className="block text-xs text-white/50 mb-1.5">Skill Content *</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="The prompt guide or instructions for this skill..."
                    rows={6}
                    className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-skinny-yellow/50 resize-none"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">
                    This content will be injected into your prompts when you use @{shortcut || 'shortcut'}
                  </p>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="lighting, cinematic, film"
                    className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-skinny-yellow/50"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
                <p className="text-[10px] text-zinc-500">
                  <kbd className="text-zinc-400">Cmd+Enter</kbd> to save
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!canSave}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                      canSave
                        ? "bg-skinny-yellow text-black hover:bg-skinny-yellow/90"
                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    )}
                  >
                    <Sparkles size={14} />
                    Save Skill
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
