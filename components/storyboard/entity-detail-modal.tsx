'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Trash2, Sparkles, Edit2, Eye, User, Globe, Box, Palette, RefreshCw, Upload, Copy, Check, Info, Cpu, Image } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StoryboardEntity, EntityType } from '@/lib/types'
import { glassClasses } from '@/lib/liquid-glass-styles'
import { toast } from 'sonner'

interface EntityDetailModalProps {
  entity: StoryboardEntity | null
  isOpen: boolean
  onClose: () => void
  onSave: (updates: Partial<StoryboardEntity>) => Promise<boolean>
  onDelete: (entityId: string) => Promise<boolean>
  onAnalyze: (entityId: string) => Promise<string | null>
  mode: 'view' | 'edit'
}

const ENTITY_TYPES: { type: EntityType; label: string; icon: typeof User; color: string; bgColor: string }[] = [
  { type: 'character', label: 'Character', icon: User, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  { type: 'world', label: 'World/Location', icon: Globe, color: 'text-green-400', bgColor: 'bg-green-500/20' },
  { type: 'object', label: 'Object/Prop', icon: Box, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  { type: 'style', label: 'Style', icon: Palette, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
]

type TabId = 'details' | 'analysis' | 'technical'

export function EntityDetailModal({
  entity,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onAnalyze,
  mode: initialMode,
}: EntityDetailModalProps) {
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode)
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [entityType, setEntityType] = useState<EntityType>('character')
  const [isSaving, setIsSaving] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset mode when modal opens
  useEffect(() => {
    setMode(initialMode)
    setActiveTab('details')
  }, [initialMode, isOpen])

  // Populate form when entity changes
  useEffect(() => {
    if (entity) {
      setName(entity.entityName || '')
      setDescription(entity.entityDescription || '')
      setEntityType(entity.entityType || 'character')
    }
  }, [entity])

  const handleSave = async () => {
    if (!entity) return

    setIsSaving(true)
    try {
      const success = await onSave({
        entityName: name,
        entityDescription: description,
        entityType,
      })
      if (success) {
        setMode('view')
      }
    } catch (error) {
      console.error('Failed to save entity:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!entity) return
    if (!confirm('Are you sure you want to delete this entity? It will be removed from all shots.')) {
      return
    }

    setIsDeleting(true)
    try {
      await onDelete(entity.id)
    } catch (error) {
      console.error('Failed to delete entity:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleAnalyze = async () => {
    if (!entity) return

    setIsAnalyzing(true)
    try {
      await onAnalyze(entity.id)
      setActiveTab('analysis')
    } catch (error) {
      console.error('Failed to analyze entity:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCopyContext = () => {
    if (!entity?.visionContext) return
    navigator.clipboard.writeText(entity.visionContext)
    setCopied(true)
    toast.success('Vision context copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!mounted) return null

  const typeConfig = ENTITY_TYPES.find(t => t.type === (mode === 'edit' ? entityType : entity?.entityType)) || ENTITY_TYPES[0]
  const TypeIcon = typeConfig.icon

  const tabs: { id: TabId; label: string; icon: typeof Info }[] = [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'analysis', label: 'AI Analysis', icon: Sparkles },
    { id: 'technical', label: 'Technical', icon: Cpu },
  ]

  const modalContent = (
    <AnimatePresence>
      {isOpen && entity && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "relative w-full max-w-2xl overflow-hidden rounded-2xl",
              "bg-zinc-900/95 backdrop-blur-xl border border-white/10",
              "shadow-2xl shadow-black/50"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-4">
                {/* Entity Image Thumbnail */}
                <div className={cn(
                  "relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0",
                  "bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10"
                )}>
                  {entity.primaryImageUrl ? (
                    <img
                      src={entity.primaryImageUrl}
                      alt={entity.entityName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center", typeConfig.bgColor)}>
                      <TypeIcon size={24} className={typeConfig.color} />
                    </div>
                  )}
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <RefreshCw size={16} className="text-skinny-yellow animate-spin" />
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {mode === 'edit' ? 'Edit Entity' : entity.entityName}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium", typeConfig.bgColor, typeConfig.color)}>
                      <TypeIcon size={10} />
                      {typeConfig.label}
                    </span>
                    {entity.visionContext && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400">
                        <Sparkles size={10} />
                        Analyzed
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {mode === 'view' && (
                  <button
                    onClick={() => setMode('edit')}
                    className={cn(
                      "p-2 rounded-xl transition-all duration-200",
                      "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className={cn(
                    "p-2 rounded-xl transition-all duration-200",
                    "text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Tabs (View mode only) */}
            {mode === 'view' && (
              <div className="flex px-6 pt-3 gap-1 border-b border-white/5">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all duration-200",
                      activeTab === tab.id
                        ? "bg-white/5 text-white border-b-2 border-skinny-yellow"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                    )}
                  >
                    <tab.icon size={14} />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              {mode === 'view' ? (
                // View Mode with Tabs
                <>
                  {activeTab === 'details' && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-5"
                    >
                      {/* Large Entity Image */}
                      <div className="flex justify-center">
                        <div className={cn(
                          "relative w-40 h-40 rounded-2xl overflow-hidden",
                          "bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10",
                          "shadow-xl"
                        )}>
                          {entity.primaryImageUrl ? (
                            <img
                              src={entity.primaryImageUrl}
                              alt={entity.entityName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={cn("w-full h-full flex items-center justify-center", typeConfig.bgColor)}>
                              <TypeIcon size={48} className={typeConfig.color} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Name & Description */}
                      <div className={cn(
                        "p-4 rounded-xl",
                        "bg-white/[0.02] border border-white/5"
                      )}>
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Name</label>
                        <p className="text-white font-medium">{entity.entityName}</p>
                      </div>

                      <div className={cn(
                        "p-4 rounded-xl",
                        "bg-white/[0.02] border border-white/5"
                      )}>
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Description</label>
                        <p className="text-zinc-300 text-sm">
                          {entity.entityDescription || <span className="text-zinc-600 italic">No description provided</span>}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'analysis' && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-5"
                    >
                      {/* Vision Context */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-skinny-yellow" />
                            <label className="text-sm font-medium text-white">AI Vision Analysis</label>
                          </div>
                          <div className="flex items-center gap-2">
                            {entity.visionContext && (
                              <button
                                onClick={handleCopyContext}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                  "bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
                                )}
                              >
                                {copied ? <Check size={12} /> : <Copy size={12} />}
                                {copied ? 'Copied!' : 'Copy'}
                              </button>
                            )}
                            <button
                              onClick={handleAnalyze}
                              disabled={isAnalyzing || !entity.primaryImageUrl}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                "bg-skinny-yellow/10 border border-skinny-yellow/30 text-skinny-yellow",
                                "hover:bg-skinny-yellow/20 disabled:opacity-50"
                              )}
                            >
                              {isAnalyzing ? (
                                <>
                                  <RefreshCw size={12} className="animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <Sparkles size={12} />
                                  {entity.visionContext ? 'Re-analyze' : 'Analyze'}
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {entity.visionContext ? (
                          <div className={cn(
                            "p-4 rounded-xl",
                            "bg-gradient-to-br from-skinny-yellow/5 to-transparent border border-skinny-yellow/20"
                          )}>
                            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{entity.visionContext}</p>
                          </div>
                        ) : (
                          <div className={cn(
                            "p-6 rounded-xl text-center",
                            "bg-white/[0.02] border border-white/5"
                          )}>
                            <Sparkles size={32} className="text-zinc-600 mx-auto mb-3" />
                            <p className="text-sm text-zinc-500">
                              {entity.primaryImageUrl
                                ? 'Click "Analyze" to generate AI vision context for this entity'
                                : 'Add an image to enable AI analysis'}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'technical' && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-4"
                    >
                      {/* Technical Details Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className={cn("p-3 rounded-xl", "bg-white/[0.02] border border-white/5")}>
                          <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Entity ID</label>
                          <p className="text-xs text-zinc-400 font-mono truncate">{entity.id}</p>
                        </div>
                        <div className={cn("p-3 rounded-xl", "bg-white/[0.02] border border-white/5")}>
                          <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Type</label>
                          <p className="text-xs text-zinc-400">{typeConfig.label}</p>
                        </div>
                        <div className={cn("p-3 rounded-xl", "bg-white/[0.02] border border-white/5")}>
                          <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Storyboard ID</label>
                          <p className="text-xs text-zinc-400 font-mono truncate">{entity.storyboardId}</p>
                        </div>
                        <div className={cn("p-3 rounded-xl", "bg-white/[0.02] border border-white/5")}>
                          <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Created</label>
                          <p className="text-xs text-zinc-400">
                            {entity.createdAt ? new Date(entity.createdAt).toLocaleDateString() : 'Unknown'}
                          </p>
                        </div>
                      </div>

                      {/* Source Info */}
                      {(entity.generationId || entity.folderId) && (
                        <div className={cn("p-3 rounded-xl", "bg-white/[0.02] border border-white/5")}>
                          <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Source</label>
                          <p className="text-xs text-zinc-400">
                            {entity.generationId ? `Generation: ${entity.generationId.slice(0, 8)}...` : ''}
                            {entity.folderId ? `Folder: ${entity.folderId.slice(0, 8)}...` : ''}
                          </p>
                        </div>
                      )}

                      {/* Image URL */}
                      {entity.primaryImageUrl && (
                        <div className={cn("p-3 rounded-xl", "bg-white/[0.02] border border-white/5")}>
                          <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Image URL</label>
                          <p className="text-xs text-zinc-400 font-mono truncate">{entity.primaryImageUrl}</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </>
              ) : (
                // Edit Mode
                <div className="space-y-5">
                  {/* Name Input */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Main Character"
                      className={cn(
                        "w-full px-4 py-3 rounded-xl text-white placeholder-zinc-500 transition-all duration-300",
                        "bg-white/[0.03] border border-white/10",
                        "focus:outline-none focus:border-skinny-yellow/50 focus:bg-white/[0.05]"
                      )}
                    />
                  </div>

                  {/* Type Selector */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {ENTITY_TYPES.map(type => (
                        <button
                          key={type.type}
                          onClick={() => setEntityType(type.type)}
                          className={cn(
                            "flex items-center gap-2 p-3 rounded-xl border transition-all duration-300",
                            entityType === type.type
                              ? "border-skinny-yellow/50 bg-skinny-yellow/10 text-white shadow-lg shadow-skinny-yellow/10"
                              : "border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:bg-white/[0.04]"
                          )}
                        >
                          <type.icon size={16} className={entityType === type.type ? 'text-skinny-yellow' : ''} />
                          <span className="text-sm">{type.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description Input */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe this entity..."
                      rows={3}
                      className={cn(
                        "w-full px-4 py-3 rounded-xl text-white placeholder-zinc-500 resize-none transition-all duration-300",
                        "bg-white/[0.03] border border-white/10",
                        "focus:outline-none focus:border-skinny-yellow/50 focus:bg-white/[0.05]"
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-black/20">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300",
                  "text-red-400 hover:text-red-300 hover:bg-red-400/10",
                  "disabled:opacity-50"
                )}
              >
                <Trash2 size={16} />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>

              <div className="flex items-center gap-3">
                {mode === 'edit' ? (
                  <>
                    <button
                      onClick={() => setMode('view')}
                      className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving || !name.trim()}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-300",
                        "bg-gradient-to-br from-skinny-yellow to-skinny-yellow/80 text-black",
                        "shadow-lg shadow-skinny-yellow/30 hover:shadow-skinny-yellow/50",
                        "hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                      )}
                    >
                      <Save size={16} />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => setMode('edit')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300",
                        "bg-white/5 border border-white/10 text-white",
                        "hover:bg-white/10 hover:border-white/20"
                      )}
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}
