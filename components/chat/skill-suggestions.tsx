'use client'

import { memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skill } from '@/lib/types'

interface SkillSuggestionsProps {
  suggestedSkills: Skill[]
  onSelectSkill: (skill: Skill) => void
  onDismiss: () => void
  className?: string
}

/**
 * Proactive Skill Suggestions
 *
 * Shows contextual skill chips based on detected intent in user's message.
 * Appears above the chat input when keywords match INTENT_SKILL_MAP.
 */
export const SkillSuggestions = memo(function SkillSuggestions({
  suggestedSkills,
  onSelectSkill,
  onDismiss,
  className,
}: SkillSuggestionsProps) {
  // Only show first 4 suggestions to avoid clutter
  const displaySkills = useMemo(() =>
    suggestedSkills.slice(0, 4),
    [suggestedSkills]
  )

  if (displaySkills.length === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: 8, height: 0 }}
        className={cn(
          "overflow-hidden",
          className
        )}
      >
        <div className="px-4 py-2 border-b border-white/[0.03]">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-skinny-yellow" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                Suggested Skills
              </span>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors"
              title="Dismiss suggestions"
            >
              <X size={12} />
            </button>
          </div>

          {/* Skill Chips */}
          <div className="flex flex-wrap gap-2">
            {displaySkills.map((skill, index) => (
              <motion.button
                key={skill.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: { delay: index * 0.05 }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectSkill(skill)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-1.5 rounded-lg",
                  "bg-white/[0.03] border border-white/[0.06]",
                  "hover:bg-skinny-yellow/10 hover:border-skinny-yellow/30",
                  "transition-all duration-200"
                )}
              >
                {/* Icon */}
                <span className="text-sm">{skill.icon || '📌'}</span>

                {/* Name and Shortcut */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/70 group-hover:text-white font-medium">
                    {skill.name}
                  </span>
                  <code className="hidden sm:inline px-1 py-0.5 rounded bg-white/[0.05] text-skinny-yellow/80 text-[9px] font-mono group-hover:text-skinny-yellow">
                    @{skill.shortcut}
                  </code>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Hint */}
          <p className="mt-2 text-[10px] text-white/25">
            Click to add skill guidance to your message
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
})

/**
 * Utility: Extract keywords from input text for intent matching
 */
export function extractIntentKeywords(input: string): string[] {
  // Normalize and split into words
  const words = input.toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3)

  // Remove common stop words
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'are',
    'was', 'were', 'been', 'being', 'has', 'had', 'will', 'would', 'could',
    'should', 'can', 'may', 'might', 'must', 'shall', 'want', 'need',
    'create', 'make', 'generate', 'build', 'design', 'image', 'picture',
    'photo', 'please', 'help', 'give', 'show', 'like', 'something',
  ])

  return words.filter(word => !stopWords.has(word))
}

export default SkillSuggestions
