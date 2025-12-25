'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  X, Plus, Search, ChevronRight, Check, Trash2,
  Edit3, Copy, ToggleLeft, ToggleRight, Zap,
  Palette, Wand2, Wrench, GitBranch, Star, LucideIcon
} from 'lucide-react'
import { useSkills } from '@/lib/context/skills-context'
import { Skill, SkillCategory } from '@/lib/types'

interface SkillsManagerProps {
  isOpen: boolean
  onClose: () => void
}

const categoryConfig: Record<SkillCategory, { label: string; color: string; icon: LucideIcon; iconColor: string }> = {
  style: { label: 'Style', color: 'bg-purple-500/20 text-purple-400', icon: Palette, iconColor: 'text-purple-400' },
  technique: { label: 'Technique', color: 'bg-blue-500/20 text-blue-400', icon: Wand2, iconColor: 'text-blue-400' },
  tool: { label: 'Tool', color: 'bg-green-500/20 text-green-400', icon: Wrench, iconColor: 'text-green-400' },
  workflow: { label: 'Workflow', color: 'bg-orange-500/20 text-orange-400', icon: GitBranch, iconColor: 'text-orange-400' },
  custom: { label: 'Custom', color: 'bg-skinny-yellow/20 text-skinny-yellow', icon: Star, iconColor: 'text-skinny-yellow' },
}

function SkillCard({
  skill,
  onToggle,
  onEdit,
  onDelete,
  isHovered,
  onHover,
}: {
  skill: Skill
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  isHovered: boolean
  onHover: (hovered: boolean) => void
}) {
  const cat = categoryConfig[skill.category]
  const IconComponent = cat.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative group"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div
        className={cn(
          "relative overflow-hidden border transition-all duration-300 ease-out cursor-pointer",
          isHovered
            ? "h-28 border-skinny-lime/50 shadow-lg shadow-skinny-lime/10 bg-skinny-lime/[0.03]"
            : "h-20 border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02]",
          !skill.isActive && "opacity-50"
        )}
        style={{ borderRadius: '16px' }}
      >
        {/* Corner brackets on hover */}
        {isHovered && (
          <>
            <div className="absolute top-3 left-3 w-5 h-5">
              <div className="absolute top-0 left-0 w-3 h-[2px] bg-skinny-lime" />
              <div className="absolute top-0 left-0 w-[2px] h-3 bg-skinny-lime" />
            </div>
            <div className="absolute bottom-3 right-3 w-5 h-5">
              <div className="absolute bottom-0 right-0 w-3 h-[2px] bg-skinny-lime" />
              <div className="absolute bottom-0 right-0 w-[2px] h-3 bg-skinny-lime" />
            </div>
          </>
        )}

        {/* Content */}
        <div className="flex items-center h-full px-5">
          {/* Icon */}
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0",
            isHovered ? "bg-skinny-lime/20 scale-110" : "bg-white/[0.05]"
          )}>
            <IconComponent size={20} className={cn(
              "transition-colors duration-300",
              isHovered ? "text-skinny-lime" : cat.iconColor
            )} />
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0 ml-4">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className={cn(
                "font-semibold transition-colors duration-300 truncate",
                isHovered ? "text-skinny-lime" : "text-white"
              )}>
                {skill.name}
              </h3>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[9px] font-medium uppercase tracking-wide shrink-0",
                cat.color
              )}>
                {cat.label}
              </span>
            </div>
            <p className={cn(
              "text-xs transition-colors duration-300 line-clamp-1",
              isHovered ? "text-white/70" : "text-white/40"
            )}>
              {skill.description}
            </p>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 mt-2"
              >
                <code className="px-2 py-0.5 rounded bg-black/30 text-skinny-lime text-[10px] font-mono">
                  @{skill.shortcut}
                </code>
                <span className="text-[10px] text-white/30">
                  {skill.usageCount} uses
                </span>
              </motion.div>
            )}
          </div>

          {/* Actions - visible on hover */}
          <div className={cn(
            "flex items-center gap-1 ml-3 transition-all duration-300",
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
          )}>
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={cn(
                "p-2 rounded-lg transition-colors",
                skill.isActive
                  ? "text-skinny-lime hover:bg-skinny-lime/20"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
              )}
              title={skill.isActive ? 'Disable' : 'Enable'}
            >
              {skill.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
              title="Edit"
            >
              <Edit3 size={16} />
            </button>
            {!skill.isBuiltIn && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function SkillEditor({
  skill,
  onSave,
  onCancel,
}: {
  skill?: Skill
  onSave: (data: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(skill?.name || '')
  const [description, setDescription] = useState(skill?.description || '')
  const [category, setCategory] = useState<SkillCategory>(skill?.category || 'custom')
  const [icon, setIcon] = useState(skill?.icon || '📌')
  const [shortcut, setShortcut] = useState(skill?.shortcut || '')
  const [content, setContent] = useState(skill?.content || '')
  const [tags, setTags] = useState(skill?.tags.join(', ') || '')

  const handleSave = () => {
    if (!name.trim() || !shortcut.trim() || !content.trim()) return

    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      icon,
      shortcut: shortcut.toLowerCase().replace(/\s+/g, '-'),
      content: content.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      isBuiltIn: false,
      isActive: true,
      examples: [],
    })
  }

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-lg font-medium text-white">
        {skill ? 'Edit Skill' : 'Create New Skill'}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My Style Guide"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Shortcut</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-skinny-yellow text-sm">@</span>
            <input
              type="text"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
              placeholder="my-style"
              className="w-full pl-7 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1.5">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of what this skill does"
          className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SkillCategory)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm focus:outline-none focus:border-white/20"
          >
            <option value="style">Style</option>
            <option value="technique">Technique</option>
            <option value="tool">Tool</option>
            <option value="workflow">Workflow</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Icon (emoji)</label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 2))}
            placeholder="📌"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1.5">
          Prompt Guide / Instructions
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write the instructions that will be included when this skill is referenced. Use bullet points for best results."
          rows={6}
          className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1.5">Tags (comma-separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="style, photography, minimal"
          className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !shortcut.trim() || !content.trim()}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            name.trim() && shortcut.trim() && content.trim()
              ? "bg-skinny-yellow text-black hover:bg-skinny-yellow/90"
              : "bg-white/[0.05] text-white/30 cursor-not-allowed"
          )}
        >
          {skill ? 'Save Changes' : 'Create Skill'}
        </button>
      </div>
    </div>
  )
}

// Pack color mapping
const packColorClasses: Record<string, { bg: string; border: string; text: string }> = {
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
  sky: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  yellow: { bg: 'bg-skinny-yellow/10', border: 'border-skinny-yellow/30', text: 'text-skinny-yellow' },
}

export function SkillsManager({ isOpen, onClose }: SkillsManagerProps) {
  const { state, addSkill, updateSkill, deleteSkill, toggleSkill, searchSkills, skillPacks, activateSkillPack, deactivateSkillPack, isPackActive } = useSkills()
  const [search, setSearch] = useState('')
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null)

  const filteredSkills = search ? searchSkills(search) : state.skills

  const handleSave = useCallback((data: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>) => {
    if (editingSkill) {
      updateSkill(editingSkill.id, data)
    } else {
      addSkill(data)
    }
    setEditingSkill(null)
    setIsCreating(false)
  }, [editingSkill, addSkill, updateSkill])

  const handleDelete = useCallback((skill: Skill) => {
    if (skill.isBuiltIn) return
    if (confirm(`Delete "${skill.name}"? This cannot be undone.`)) {
      deleteSkill(skill.id)
    }
  }, [deleteSkill])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-2xl max-h-[85vh] bg-zinc-900 rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-skinny-yellow/10 flex items-center justify-center">
                <Zap size={20} className="text-skinny-yellow" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white">Skills</h2>
                <p className="text-xs text-white/50">Create and manage custom prompt guides</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          {isCreating || editingSkill ? (
            <SkillEditor
              skill={editingSkill || undefined}
              onSave={handleSave}
              onCancel={() => {
                setEditingSkill(null)
                setIsCreating(false)
              }}
            />
          ) : (
            <>
              {/* Search & Add */}
              <div className="px-6 py-4 border-b border-white/[0.08] flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search skills..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
                  />
                </div>
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-skinny-yellow text-black text-sm font-medium hover:bg-skinny-yellow/90 transition-colors"
                >
                  <Plus size={16} />
                  <span>New Skill</span>
                </button>
              </div>

              {/* Skill Packs Section */}
              <div className="px-6 py-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 mb-3">
                  <Star size={14} className="text-skinny-yellow" />
                  <h3 className="text-sm font-medium text-white">Skill Packs</h3>
                  <span className="text-[10px] text-white/40">Quick-activate skill bundles</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {skillPacks.map((pack) => {
                    const isActive = isPackActive(pack.id)
                    const colors = packColorClasses[pack.color] || packColorClasses.yellow
                    return (
                      <motion.button
                        key={pack.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => isActive ? deactivateSkillPack(pack.id) : activateSkillPack(pack.id)}
                        className={cn(
                          "relative group p-3 rounded-xl border transition-all text-left",
                          isActive
                            ? `${colors.bg} ${colors.border}`
                            : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{pack.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-sm font-medium",
                                isActive ? colors.text : "text-white"
                              )}>
                                {pack.name}
                              </span>
                              {isActive && (
                                <Check size={12} className={colors.text} />
                              )}
                            </div>
                            <p className="text-[10px] text-white/40 line-clamp-1">{pack.description}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {pack.skills.slice(0, 3).map((shortcut) => (
                                <span
                                  key={shortcut}
                                  className="px-1.5 py-0.5 rounded bg-black/20 text-[9px] text-white/50"
                                >
                                  @{shortcut}
                                </span>
                              ))}
                              {pack.skills.length > 3 && (
                                <span className="px-1.5 py-0.5 text-[9px] text-white/30">
                                  +{pack.skills.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {/* Skills List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <AnimatePresence mode="popLayout">
                  {filteredSkills.length > 0 ? (
                    filteredSkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        onToggle={() => toggleSkill(skill.id)}
                        onEdit={() => setEditingSkill(skill)}
                        onDelete={() => handleDelete(skill)}
                        isHovered={hoveredSkillId === skill.id}
                        onHover={(hovered) => setHoveredSkillId(hovered ? skill.id : null)}
                      />
                    ))
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12"
                    >
                      <Zap size={32} className="mx-auto text-white/20 mb-3" />
                      <p className="text-white/50 text-sm">
                        {search ? 'No skills match your search' : 'No skills yet'}
                      </p>
                      <button
                        onClick={() => setIsCreating(true)}
                        className="mt-4 text-skinny-yellow text-sm hover:underline"
                      >
                        Create your first skill
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-white/[0.08] bg-white/[0.02]">
                <p className="text-[11px] text-white/40 text-center">
                  Reference skills in chat using <code className="text-skinny-yellow">@shortcut</code> syntax
                </p>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
