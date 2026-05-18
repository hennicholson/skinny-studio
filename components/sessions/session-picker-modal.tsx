'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, CheckCircle, Layers, Package, Music, Target, Smartphone, Sparkles, Plus, Pencil, Trash2, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessions } from '@/lib/context/sessions-context'
import { SessionTemplate, sessionTypeConfig } from '@/lib/types'
import { SkinnyBriefData } from '@/components/chat/skinny-brief'
import { TemplateEditorModal } from './template-editor-modal'

// Map icon names to lucide components
const iconMap: Record<string, LucideIcon> = {
  Package,
  Music,
  Target,
  Smartphone,
  Sparkles,
}

function getIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Package
}

interface SessionPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateSession?: (session: ReturnType<typeof useSessions>['sessions'][0]) => void
  briefContext?: SkinnyBriefData | null
}

/**
 * Session Picker Modal
 *
 * Grid of session template cards for starting a new guided creative mission.
 */
export function SessionPickerModal({
  isOpen,
  onClose,
  onCreateSession,
  briefContext,
}: SessionPickerModalProps) {
  const { getAllTemplates, createSession, addCustomTemplate, updateCustomTemplate, deleteCustomTemplate } = useSessions()
  const [selectedTemplate, setSelectedTemplate] = useState<SessionTemplate | null>(null)
  const [sessionTitle, setSessionTitle] = useState('')
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplate | null>(null)

  const templates = getAllTemplates()

  const handleSelectTemplate = (template: SessionTemplate) => {
    setSelectedTemplate(template)
    setSessionTitle(`${template.name} - ${new Date().toLocaleDateString()}`)
  }

  const handleCreateSession = () => {
    if (!selectedTemplate) return

    const session = createSession({
      templateId: selectedTemplate.id,
      title: sessionTitle || undefined,
      briefContext,
    })

    // Call onCreateSession - this handles closing the picker
    // Do NOT call onClose() here since that would exit session mode
    onCreateSession?.(session)
    setSelectedTemplate(null)
    setSessionTitle('')
  }

  const handleClose = () => {
    onClose()
    setSelectedTemplate(null)
    setSessionTitle('')
  }

  const handleSaveTemplate = (template: SessionTemplate) => {
    if (editingTemplate) {
      updateCustomTemplate(template.id, template)
    } else {
      addCustomTemplate(template)
    }
    setIsTemplateEditorOpen(false)
    setEditingTemplate(null)
  }

  const handleEditTemplate = (e: React.MouseEvent, template: SessionTemplate) => {
    e.stopPropagation()
    setEditingTemplate(template)
    setIsTemplateEditorOpen(true)
  }

  const handleDeleteTemplate = (e: React.MouseEvent, template: SessionTemplate) => {
    e.stopPropagation()
    if (confirm(`Delete "${template.name}" template?`)) {
      deleteCustomTemplate(template.id)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-skinny-yellow/10">
                <Layers size={20} className="text-skinny-yellow" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Start a Session</h2>
                <p className="text-sm text-white/50">Choose a creative mission template</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {!selectedTemplate ? (
              // Template Grid
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {templates.map((template) => {
                  const config = sessionTypeConfig[template.type]
                  const isCustom = template.type === 'custom'
                  return (
                    <motion.button
                      key={template.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSelectTemplate(template)}
                      className="group relative text-left p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-skinny-yellow/30 hover:bg-white/[0.04] transition-all"
                    >
                      {/* Custom template badge and actions */}
                      {isCustom && (
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-skinny-yellow/10 text-skinny-yellow rounded">
                            Custom
                          </span>
                          <button
                            onClick={(e) => handleEditTemplate(e, template)}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/50 hover:text-white transition-all"
                            title="Edit template"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteTemplate(e, template)}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-all"
                            title="Delete template"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-start gap-4">
                        {(() => {
                          const Icon = getIcon(template.icon)
                          return (
                            <div className="p-3 rounded-xl bg-white/[0.05] group-hover:bg-skinny-yellow/10 transition-colors">
                              <Icon size={24} className="text-white/60 group-hover:text-skinny-yellow transition-colors" />
                            </div>
                          )
                        })()}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-white group-hover:text-skinny-yellow transition-colors">
                            {template.name}
                          </h3>
                          <p className="text-sm text-white/50 mt-1 line-clamp-2">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-xs text-white/30">
                              {template.assets.length} assets
                            </span>
                            <span className="text-xs text-white/30">
                              {template.assets.filter(a => a.required).length} required
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={18}
                          className="text-white/30 group-hover:text-skinny-yellow transition-colors mt-1"
                        />
                      </div>
                    </motion.button>
                  )
                })}

                {/* Create Custom Template Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setEditingTemplate(null)
                    setIsTemplateEditorOpen(true)
                  }}
                  className="group text-left p-5 rounded-xl border-2 border-dashed border-white/[0.08] hover:border-skinny-yellow/30 hover:bg-white/[0.02] transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/[0.03] group-hover:bg-skinny-yellow/10 transition-colors">
                      <Plus size={24} className="text-white/40 group-hover:text-skinny-yellow transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white/70 group-hover:text-skinny-yellow transition-colors">
                        Create Custom Template
                      </h3>
                      <p className="text-sm text-white/40 mt-1">
                        Design your own session workflow
                      </p>
                    </div>
                  </div>
                </motion.button>
              </div>
            ) : (
              // Template Details & Confirmation
              <div className="space-y-6">
                {/* Selected Template */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-skinny-yellow/20">
                  {(() => {
                    const Icon = getIcon(selectedTemplate.icon)
                    return (
                      <div className="p-3 rounded-xl bg-skinny-yellow/10">
                        <Icon size={28} className="text-skinny-yellow" />
                      </div>
                    )
                  })()}
                  <div className="flex-1">
                    <h3 className="font-medium text-skinny-yellow text-lg">
                      {selectedTemplate.name}
                    </h3>
                    <p className="text-sm text-white/50 mt-1">
                      {selectedTemplate.description}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="text-xs text-white/50 hover:text-white transition-colors"
                  >
                    Change
                  </button>
                </div>

                {/* Session Title */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Session Title
                  </label>
                  <input
                    type="text"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    placeholder="Name your session..."
                    className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white placeholder-white/30 focus:outline-none focus:border-skinny-yellow/50"
                  />
                </div>

                {/* Assets Preview */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">
                    Assets to Create
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {selectedTemplate.assets.map((asset) => (
                      <div
                        key={asset.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg",
                          asset.required
                            ? "bg-white/[0.03]"
                            : "bg-white/[0.01] opacity-70"
                        )}
                      >
                        <CheckCircle
                          size={16}
                          className={cn(
                            asset.required ? "text-skinny-yellow" : "text-white/30"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white">{asset.name}</span>
                          {asset.required && (
                            <span className="ml-2 text-xs text-skinny-yellow/70">Required</span>
                          )}
                        </div>
                        <span className="text-xs text-white/30">{asset.aspectRatio}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Brief Context Notice */}
                {briefContext && (
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <p className="text-xs text-purple-300">
                      Your creative brief will be applied to this session
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {selectedTemplate && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.02]">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="px-4 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateSession}
                className="px-6 py-2 rounded-lg bg-skinny-yellow text-black font-medium hover:bg-skinny-yellow/90 transition-colors"
              >
                Start Session
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Template Editor Modal */}
      <TemplateEditorModal
        isOpen={isTemplateEditorOpen}
        onClose={() => {
          setIsTemplateEditorOpen(false)
          setEditingTemplate(null)
        }}
        onSave={handleSaveTemplate}
        editingTemplate={editingTemplate}
      />
    </AnimatePresence>
  )
}

export default SessionPickerModal
