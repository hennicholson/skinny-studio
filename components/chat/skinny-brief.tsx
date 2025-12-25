'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Palette, Layout, Sparkles, Layers, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSkills } from '@/lib/context/skills-context'

export interface SkinnyBriefData {
  vibe: string
  platform: Platform
  style: string
  outputType: OutputType
}

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'web' | 'print' | 'other' | ''
export type OutputType = 'single' | 'series' | 'variations' | ''

// Platform aspect ratio suggestions
const PLATFORM_CONFIG: Record<Platform, { label: string; aspect: string; icon: string }> = {
  instagram: { label: 'Instagram', aspect: '1:1 or 4:5', icon: '📸' },
  tiktok: { label: 'TikTok', aspect: '9:16', icon: '🎵' },
  youtube: { label: 'YouTube', aspect: '16:9', icon: '🎬' },
  web: { label: 'Web', aspect: '16:9 or 4:3', icon: '🌐' },
  print: { label: 'Print', aspect: '300dpi, high-res', icon: '🖨️' },
  other: { label: 'Other', aspect: 'Custom', icon: '✨' },
  '': { label: 'Select...', aspect: '', icon: '' },
}

const OUTPUT_OPTIONS: Array<{ value: OutputType; label: string; description: string }> = [
  { value: 'single', label: 'Single', description: 'One image' },
  { value: 'series', label: 'Series', description: 'Multiple related' },
  { value: 'variations', label: 'Variations', description: 'Same concept, different styles' },
]

interface SkinnyBriefProps {
  brief: SkinnyBriefData | null
  onBriefChange: (brief: SkinnyBriefData | null) => void
  className?: string
}

export function SkinnyBrief({ brief, onBriefChange, className }: SkinnyBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [localBrief, setLocalBrief] = useState<SkinnyBriefData>({
    vibe: '',
    platform: '',
    style: '',
    outputType: '',
  })

  const { state: skillsState, getActiveSkills } = useSkills()

  // Get active skills for style autocomplete
  const activeSkills = useMemo(() => getActiveSkills(), [getActiveSkills])

  // Check if brief has any content
  const hasBrief = brief && (brief.vibe || brief.platform || brief.style || brief.outputType)

  // Handle expand/collapse
  const toggleExpand = useCallback(() => {
    if (!isExpanded && brief) {
      // Load existing brief when expanding
      setLocalBrief(brief)
    }
    setIsExpanded(!isExpanded)
  }, [isExpanded, brief])

  // Update local brief field
  const updateField = useCallback(<K extends keyof SkinnyBriefData>(
    field: K,
    value: SkinnyBriefData[K]
  ) => {
    setLocalBrief(prev => ({ ...prev, [field]: value }))
  }, [])

  // Apply brief
  const applyBrief = useCallback(() => {
    // Only apply if at least one field has content
    if (localBrief.vibe || localBrief.platform || localBrief.style || localBrief.outputType) {
      onBriefChange(localBrief)
    } else {
      onBriefChange(null)
    }
    setIsExpanded(false)
  }, [localBrief, onBriefChange])

  // Clear brief
  const clearBrief = useCallback(() => {
    setLocalBrief({ vibe: '', platform: '', style: '', outputType: '' })
    onBriefChange(null)
    setIsExpanded(false)
  }, [onBriefChange])

  return (
    <div className={cn("relative", className)}>
      {/* Collapsed State - Pill Button */}
      <motion.button
        onClick={toggleExpand}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
          hasBrief
            ? "bg-skinny-yellow/20 text-skinny-yellow border border-skinny-yellow/30"
            : "bg-white/[0.03] text-white/50 border border-white/[0.08] hover:bg-white/[0.05] hover:text-white/70"
        )}
      >
        <Palette size={12} />
        <span>{hasBrief ? 'Brief Active' : 'Add Brief'}</span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </motion.button>

      {/* Expanded State - Brief Form */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="absolute top-full left-0 right-0 mt-2 z-50"
          >
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-skinny-yellow" />
                  <span className="text-xs font-medium text-white">The Skinny</span>
                  <span className="text-[10px] text-white/40">Quick creative brief</span>
                </div>
                {hasBrief && (
                  <button
                    onClick={clearBrief}
                    className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Clear brief"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Brief Fields - Compact Grid */}
              <div className="grid grid-cols-2 gap-2">
                {/* Vibe */}
                <div>
                  <label className="block text-[10px] text-white/40 mb-1">Vibe / Mood</label>
                  <input
                    type="text"
                    value={localBrief.vibe}
                    onChange={(e) => updateField('vibe', e.target.value)}
                    placeholder="e.g., dreamy, bold, minimal"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-skinny-yellow/50"
                  />
                </div>

                {/* Platform */}
                <div>
                  <label className="block text-[10px] text-white/40 mb-1">Platform</label>
                  <select
                    value={localBrief.platform}
                    onChange={(e) => updateField('platform', e.target.value as Platform)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-skinny-yellow/50 appearance-none cursor-pointer"
                  >
                    {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.icon} {config.label}
                      </option>
                    ))}
                  </select>
                  {localBrief.platform && PLATFORM_CONFIG[localBrief.platform]?.aspect && (
                    <p className="mt-0.5 text-[9px] text-white/30">
                      Suggested: {PLATFORM_CONFIG[localBrief.platform].aspect}
                    </p>
                  )}
                </div>

                {/* Style - with skill shortcuts */}
                <div>
                  <label className="block text-[10px] text-white/40 mb-1">Style / Skill</label>
                  <input
                    type="text"
                    value={localBrief.style}
                    onChange={(e) => updateField('style', e.target.value)}
                    placeholder="@skill or description"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-skinny-yellow/50"
                  />
                  {activeSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeSkills.slice(0, 3).map((skill) => (
                        <button
                          key={skill.id}
                          onClick={() => updateField('style', `@${skill.shortcut}`)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.03] text-[9px] text-white/40 hover:text-skinny-yellow hover:bg-skinny-yellow/10 transition-colors"
                        >
                          @{skill.shortcut}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Output Type */}
                <div>
                  <label className="block text-[10px] text-white/40 mb-1">Output</label>
                  <div className="flex gap-1">
                    {OUTPUT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateField('outputType', opt.value)}
                        className={cn(
                          "flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all",
                          localBrief.outputType === opt.value
                            ? "bg-skinny-yellow/20 text-skinny-yellow border border-skinny-yellow/30"
                            : "bg-white/[0.03] text-white/50 border border-white/[0.08] hover:bg-white/[0.05]"
                        )}
                        title={opt.description}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Apply Button */}
              <div className="flex justify-end mt-3">
                <button
                  onClick={applyBrief}
                  className="px-4 py-1.5 rounded-lg bg-skinny-yellow text-black text-xs font-medium hover:bg-skinny-yellow/90 transition-colors"
                >
                  Apply Brief
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Format brief data for system prompt injection
 */
export function formatBriefForPrompt(brief: SkinnyBriefData | null): string {
  if (!brief) return ''

  const parts: string[] = []

  if (brief.vibe) parts.push(`Vibe: ${brief.vibe}`)
  if (brief.platform) {
    const config = PLATFORM_CONFIG[brief.platform]
    parts.push(`Platform: ${config.label} (use ${config.aspect})`)
  }
  if (brief.style) parts.push(`Style: ${brief.style}`)
  if (brief.outputType) {
    const output = OUTPUT_OPTIONS.find(o => o.value === brief.outputType)
    parts.push(`Output: ${output?.label} - ${output?.description}`)
  }

  if (parts.length === 0) return ''

  return `\n\n## User's Creative Brief\n${parts.join('\n')}`
}
