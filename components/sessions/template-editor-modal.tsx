'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Plus,
  Trash2,
  Package,
  Music,
  Target,
  Smartphone,
  ImageIcon,
  Video,
  GripVertical,
  Check,
  AlertCircle,
  LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SessionTemplate, SessionAssetTemplate } from '@/lib/types'
import { mockModels } from '@/lib/types'

interface TemplateEditorModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (template: SessionTemplate) => void
  editingTemplate?: SessionTemplate | null
}

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:5', '3:4', '4:3', '21:9'] as const
type AspectRatio = typeof ASPECT_RATIOS[number]

const ICONS = [
  { name: 'Package', icon: Package },
  { name: 'Music', icon: Music },
  { name: 'Target', icon: Target },
  { name: 'Smartphone', icon: Smartphone },
] as const

const imageModels = mockModels.filter(m => m.category === 'image')
const videoModels = mockModels.filter(m => m.category === 'video')

interface AssetFormData {
  id: string
  name: string
  description: string
  aspectRatio: AspectRatio
  modelSuggestion: string
  mediaType: 'image' | 'video'
  required: boolean
  skills: string[]
  duration?: number
}

export function TemplateEditorModal({
  isOpen,
  onClose,
  onSave,
  editingTemplate,
}: TemplateEditorModalProps) {
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<string>('Package')
  const [assets, setAssets] = useState<AssetFormData[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editingTemplate) {
        // Editing existing template
        setName(editingTemplate.name)
        setDescription(editingTemplate.description)
        setIcon(editingTemplate.icon)
        setAssets(editingTemplate.assets.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          aspectRatio: a.aspectRatio as AspectRatio,
          modelSuggestion: a.modelSuggestion,
          mediaType: a.mediaType || 'image',
          required: a.required,
          skills: a.skills,
          duration: a.duration,
        })))
      } else {
        // New template - start with one empty asset
        setName('')
        setDescription('')
        setIcon('Package')
        setAssets([createEmptyAsset()])
      }
      setErrors({})
    }
  }, [isOpen, editingTemplate])

  const createEmptyAsset = useCallback((): AssetFormData => ({
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    description: '',
    aspectRatio: '1:1',
    modelSuggestion: 'seedream-4.5',
    mediaType: 'image',
    required: true,
    skills: [],
  }), [])

  const addAsset = () => {
    setAssets(prev => [...prev, createEmptyAsset()])
  }

  const removeAsset = (id: string) => {
    if (assets.length > 1) {
      setAssets(prev => prev.filter(a => a.id !== id))
    }
  }

  const updateAsset = (id: string, updates: Partial<AssetFormData>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  const moveAsset = (fromIndex: number, toIndex: number) => {
    setAssets(prev => {
      const newAssets = [...prev]
      const [removed] = newAssets.splice(fromIndex, 1)
      newAssets.splice(toIndex, 0, removed)
      return newAssets
    })
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = 'Template name is required'
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (assets.length === 0) {
      newErrors.assets = 'At least one asset is required'
    }

    assets.forEach((asset, index) => {
      if (!asset.name.trim()) {
        newErrors[`asset-${index}-name`] = 'Asset name is required'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return

    const template: SessionTemplate = {
      id: editingTemplate?.id || `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      icon,
      type: editingTemplate?.type || 'custom',
      assets: assets.map(a => ({
        id: a.id,
        name: a.name.trim(),
        description: a.description.trim(),
        aspectRatio: a.aspectRatio,
        modelSuggestion: a.modelSuggestion,
        mediaType: a.mediaType,
        required: a.required,
        skills: a.skills,
        duration: a.mediaType === 'video' ? (a.duration || 5) : undefined,
      })),
      defaultSkills: [],
    }

    onSave(template)
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-2xl max-h-[85vh] bg-zinc-900/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h2 className="text-lg font-semibold text-white">
              {editingTemplate ? 'Edit Template' : 'Create Template'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Template Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white/70">Template Info</h3>

              {/* Name */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., E-commerce Bundle"
                  className={cn(
                    "w-full px-3 py-2 bg-white/[0.03] border rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-skinny-yellow/50",
                    errors.name ? "border-red-500/50" : "border-white/[0.08]"
                  )}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this template creates..."
                  rows={2}
                  className={cn(
                    "w-full px-3 py-2 bg-white/[0.03] border rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-skinny-yellow/50 resize-none",
                    errors.description ? "border-red-500/50" : "border-white/[0.08]"
                  )}
                />
              </div>

              {/* Icon */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Icon</label>
                <div className="flex gap-2">
                  {ICONS.map((iconOption) => {
                    const Icon = iconOption.icon
                    return (
                      <button
                        key={iconOption.name}
                        onClick={() => setIcon(iconOption.name)}
                        className={cn(
                          "p-2.5 rounded-lg border transition-colors",
                          icon === iconOption.name
                            ? "bg-skinny-yellow/10 border-skinny-yellow/30 text-skinny-yellow"
                            : "bg-white/[0.03] border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.05]"
                        )}
                      >
                        <Icon size={20} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Assets */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/70">Assets</h3>
                <button
                  onClick={addAsset}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-skinny-yellow bg-skinny-yellow/10 rounded-lg hover:bg-skinny-yellow/20 transition-colors"
                >
                  <Plus size={14} />
                  Add Asset
                </button>
              </div>

              {errors.assets && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.assets}
                </p>
              )}

              <div className="space-y-3">
                {assets.map((asset, index) => (
                  <motion.div
                    key={asset.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3"
                  >
                    {/* Asset Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center text-white/30">
                        <GripVertical size={16} />
                      </div>

                      {/* Asset Name */}
                      <input
                        type="text"
                        value={asset.name}
                        onChange={(e) => updateAsset(asset.id, { name: e.target.value })}
                        placeholder="Asset name"
                        className={cn(
                          "flex-1 px-2 py-1 bg-transparent border-b text-white placeholder-white/30 text-sm focus:outline-none focus:border-skinny-yellow",
                          errors[`asset-${index}-name`] ? "border-red-500/50" : "border-white/[0.08]"
                        )}
                      />

                      {/* Required Toggle */}
                      <button
                        onClick={() => updateAsset(asset.id, { required: !asset.required })}
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                          asset.required
                            ? "bg-skinny-yellow/20 text-skinny-yellow"
                            : "bg-white/[0.05] text-white/40 hover:bg-white/[0.08]"
                        )}
                      >
                        {asset.required ? 'Required' : 'Optional'}
                      </button>

                      {/* Delete */}
                      {assets.length > 1 && (
                        <button
                          onClick={() => removeAsset(asset.id)}
                          className="p-1 text-white/30 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Asset Description */}
                    <input
                      type="text"
                      value={asset.description}
                      onChange={(e) => updateAsset(asset.id, { description: e.target.value })}
                      placeholder="Description (optional)"
                      className="w-full px-2 py-1 bg-transparent border-b border-white/[0.05] text-white/70 placeholder-white/20 text-xs focus:outline-none focus:border-skinny-yellow/50"
                    />

                    {/* Asset Options */}
                    <div className="flex flex-wrap gap-2">
                      {/* Media Type */}
                      <select
                        value={asset.mediaType}
                        onChange={(e) => {
                          const mediaType = e.target.value as 'image' | 'video'
                          const models = mediaType === 'video' ? videoModels : imageModels
                          updateAsset(asset.id, {
                            mediaType,
                            modelSuggestion: models[0]?.id || asset.modelSuggestion,
                          })
                        }}
                        className="px-2 py-1 bg-white/[0.03] border border-white/[0.08] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-skinny-yellow/50"
                      >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>

                      {/* Aspect Ratio */}
                      <select
                        value={asset.aspectRatio}
                        onChange={(e) => updateAsset(asset.id, { aspectRatio: e.target.value as AspectRatio })}
                        className="px-2 py-1 bg-white/[0.03] border border-white/[0.08] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-skinny-yellow/50"
                      >
                        {ASPECT_RATIOS.map(ratio => (
                          <option key={ratio} value={ratio}>{ratio}</option>
                        ))}
                      </select>

                      {/* Model Suggestion */}
                      <select
                        value={asset.modelSuggestion}
                        onChange={(e) => updateAsset(asset.id, { modelSuggestion: e.target.value })}
                        className="flex-1 min-w-[120px] px-2 py-1 bg-white/[0.03] border border-white/[0.08] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-skinny-yellow/50"
                      >
                        {(asset.mediaType === 'video' ? videoModels : imageModels).map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </select>

                      {/* Duration (video only) */}
                      {asset.mediaType === 'video' && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={asset.duration || 5}
                            onChange={(e) => updateAsset(asset.id, { duration: parseInt(e.target.value) || 5 })}
                            min={1}
                            max={30}
                            className="w-14 px-2 py-1 bg-white/[0.03] border border-white/[0.08] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-skinny-yellow/50"
                          />
                          <span className="text-xs text-white/40">sec</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06]">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-skinny-yellow text-black font-medium text-sm rounded-lg hover:bg-skinny-lime transition-colors"
            >
              <Check size={16} />
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
