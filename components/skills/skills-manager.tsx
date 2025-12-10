'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  X, Plus, Search, ChevronRight, Check, Trash2,
  Edit3, Copy, ToggleLeft, ToggleRight, Zap
} from 'lucide-react'
import { useSkills } from '@/lib/context/skills-context'
import { Skill, SkillCategory } from '@/lib/types'

interface SkillsManagerProps {
  isOpen: boolean
  onClose: () => void
}

const categoryLabels: Record<SkillCategory, { label: string; color: string }> = {
  style: { label: 'Style', color: 'bg-purple-500/20 text-purple-400' },
  technique: { label: 'Technique', color: 'bg-blue-500/20 text-blue-400' },
  tool: { label: 'Tool', color: 'bg-green-500/20 text-green-400' },
  workflow: { label: 'Workflow', color: 'bg-orange-500/20 text-orange-400' },
  custom: { label: 'Custom', color: 'bg-skinny-yellow/20 text-skinny-yellow' },
}

function SkillCard({
  skill,
  onToggle,
  onEdit,
  onDelete,
}: {
  skill: Skill
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cat = categoryLabels[skill.category]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "group p-4 rounded-xl border transition-all duration-200",
        skill.isActive
          ? "bg-white/[0.03] border-white/[0.08] hover:border-white/[0.15]"
          : "bg-white/[0.01] border-white/[0.04] opacity-60 hover:opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{skill.icon || '📌'}</span>
            <h3 className="font-medium text-white truncate">{skill.name}</h3>
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", cat.color)}>
              {cat.label}
            </span>
          </div>
          <p className="text-xs text-white/50 line-clamp-2 mb-2">{skill.description}</p>
          <div className="flex items-center gap-2">
            <code className="px-2 py-0.5 rounded bg-white/[0.05] text-skinny-yellow text-[10px] font-mono">
              @{skill.shortcut}
            </code>
            <span className="text-[10px] text-white/30">
              Used {skill.usageCount} times
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Toggle */}
          <button
            onClick={onToggle}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              skill.isActive
                ? "text-skinny-yellow hover:bg-skinny-yellow/10"
                : "text-white/30 hover:text-white/50 hover:bg-white/[0.05]"
            )}
            title={skill.isActive ? 'Disable skill' : 'Enable skill'}
          >
            {skill.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          </button>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
              title="Edit skill"
            >
              <Edit3 size={14} />
            </button>
            {!skill.isBuiltIn && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete skill"
              >
                <Trash2 size={14} />
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

export function SkillsManager({ isOpen, onClose }: SkillsManagerProps) {
  const { state, addSkill, updateSkill, deleteSkill, toggleSkill, searchSkills } = useSkills()
  const [search, setSearch] = useState('')
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [isCreating, setIsCreating] = useState(false)

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
