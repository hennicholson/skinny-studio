'use client'

import { memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Lightbulb, Save, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkinnySenseContext, SessionType, getSessionTypeName, getSessionTypeIcon } from '@/lib/services/skinny-sense'
import { Skill } from '@/lib/types'

interface SkinnySensePromptProps {
  context: SkinnySenseContext | null
  onDismiss: () => void
  onSelectSkill?: (skill: Skill) => void
  onCreateSession?: (type: SessionType) => void
  onSaveAsSkill?: () => void
  className?: string
}

/**
 * Skinny Sense Prompt
 *
 * Non-intrusive toast-like notification that surfaces proactive suggestions
 * based on user behavior and AI analysis.
 */
export const SkinnySensePrompt = memo(function SkinnySensePrompt({
  context,
  onDismiss,
  onSelectSkill,
  onCreateSession,
  onSaveAsSkill,
  className,
}: SkinnySensePromptProps) {
  if (!context) return null

  // Determine what to show (priority order)
  const showSession = context.suggestSession && context.sessionType
  const showSkills = context.suggestedSkills.length > 0 && !showSession
  const showSaveSkill = context.suggestSaveSkill && !showSession && !showSkills

  // Nothing to show
  if (!showSession && !showSkills && !showSaveSkill) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className={cn(
          "bg-zinc-900/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl p-3 max-w-sm",
          className
        )}
      >
        {/* Session Suggestion */}
        {showSession && context.sessionType && (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-skinny-yellow/10">
              <Layers size={16} className="text-skinny-yellow" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-white">
                  Organize as Session?
                </span>
                <span className="text-lg">{getSessionTypeIcon(context.sessionType)}</span>
              </div>
              <p className="text-[11px] text-white/50 mt-0.5 line-clamp-2">
                {context.sessionReason || `Create a ${getSessionTypeName(context.sessionType)} session from your recent work.`}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => onCreateSession?.(context.sessionType!)}
                  className="px-3 py-1 rounded-lg bg-skinny-yellow text-black text-xs font-medium hover:bg-skinny-yellow/90 transition-colors"
                >
                  Start {getSessionTypeName(context.sessionType)}
                </button>
                <button
                  onClick={onDismiss}
                  className="px-3 py-1 rounded-lg text-white/50 text-xs hover:text-white hover:bg-white/[0.05] transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded text-white/30 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Skill Suggestions */}
        {showSkills && (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Lightbulb size={16} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-white">
                Skills that might help
              </span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {context.suggestedSkills.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => onSelectSkill?.(skill)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-purple-500/10 hover:border-purple-500/30 transition-colors"
                  >
                    <span className="text-xs">{skill.icon || '📌'}</span>
                    <span className="text-[11px] text-white/70">@{skill.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded text-white/30 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Save as Skill Suggestion */}
        {showSaveSkill && (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Save size={16} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-white">
                Save this technique?
              </span>
              <p className="text-[11px] text-white/50 mt-0.5">
                {context.saveSkillReason || 'This prompt uses effective techniques worth saving as a skill.'}
              </p>
              <button
                onClick={onSaveAsSkill}
                className="mt-2 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors"
              >
                Save as Skill
              </button>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded text-white/30 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
})

export default SkinnySensePrompt
