'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Film, Camera, Clock, Video, Image, Save, Sparkles, Trash2, ChevronDown, ImagePlus, Play, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StoryboardShot, StoryboardEntity, UpdateShotInput } from '@/lib/types'
import { EntityTypeBadge } from './entity-type-badge'
import { MODEL_SPECS, ModelSpec } from '@/lib/orchestrator/model-specs'

// Get duration options from a video model's params
function getModelDurationOptions(model: ModelSpec): number[] {
  const durationParam = model.params.optional.find(p => p.name === 'duration')
  if (durationParam?.options) {
    return durationParam.options.map(d => parseInt(d))
  }
  return [5] // Default fallback
}

// Model capabilities display component
function ModelCapabilities({ model }: { model: ModelSpec }) {
  const capabilities: { label: string; icon: typeof ImagePlus; supported: boolean }[] = []

  // Starting frame
  capabilities.push({
    label: 'Start Frame',
    icon: ImagePlus,
    supported: model.capabilities.supportsStartingFrame || false,
  })

  // End frame (for interpolation)
  if (model.type === 'video') {
    capabilities.push({
      label: 'End Frame',
      icon: Play,
      supported: model.capabilities.supportsLastFrame || false,
    })
  }

  // Reference images
  if (model.maxReferenceImages) {
    capabilities.push({
      label: `${model.maxReferenceImages} References`,
      icon: ImagePlus,
      supported: model.capabilities.supportsReferenceImages || false,
    })
  }

  // Audio (for video models like Veo)
  const hasAudio = model.params.optional.some(p => p.name === 'generate_audio')
  if (hasAudio) {
    capabilities.push({
      label: 'Audio',
      icon: Volume2,
      supported: true,
    })
  }

  const supportedCaps = capabilities.filter(c => c.supported)
  if (supportedCaps.length === 0) {
    return (
      <p className="text-xs text-zinc-500 mt-2">Text-to-{model.type} only</p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {supportedCaps.map(cap => (
        <span
          key={cap.label}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-medium"
        >
          <cap.icon size={10} />
          {cap.label}
        </span>
      ))}
    </div>
  )
}

interface ShotEditModalProps {
  isOpen: boolean
  onClose: () => void
  shot: StoryboardShot | null
  entities: StoryboardEntity[]
  onSave: (shotId: string, updates: UpdateShotInput) => Promise<void>
  onDelete: (shotId: string) => Promise<void>
  onGenerate: (shotId: string) => Promise<void>
}

const CAMERA_ANGLES = [
  'Wide shot',
  'Medium shot',
  'Close-up',
  'Extreme close-up',
  'Over the shoulder',
  'Bird\'s eye view',
  'Low angle',
  'High angle',
  'Dutch angle',
  'POV',
]

const CAMERA_MOVEMENTS = [
  'Static',
  'Pan left',
  'Pan right',
  'Tilt up',
  'Tilt down',
  'Dolly in',
  'Dolly out',
  'Tracking shot',
  'Crane shot',
  'Handheld',
]

export function ShotEditModal({
  isOpen,
  onClose,
  shot,
  entities,
  onSave,
  onDelete,
  onGenerate,
}: ShotEditModalProps) {
  const [mounted, setMounted] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cameraAngle, setCameraAngle] = useState('')
  const [cameraMovement, setCameraMovement] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(5)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [modelSlug, setModelSlug] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Filter models by media type
  const availableModels = useMemo(() => {
    return MODEL_SPECS.filter(m =>
      mediaType === 'video'
        ? m.type === 'video'
        : m.type === 'text-to-image' || m.type === 'image-to-image'
    )
  }, [mediaType])

  // Get currently selected model spec
  const selectedModel = useMemo(() => {
    return MODEL_SPECS.find(m => m.id === modelSlug)
  }, [modelSlug])

  // Get duration options for video models
  const durationOptions = useMemo(() => {
    if (mediaType !== 'video' || !selectedModel) return []
    return getModelDurationOptions(selectedModel)
  }, [mediaType, selectedModel])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Populate form when shot changes
  useEffect(() => {
    if (shot) {
      setTitle(shot.title || '')
      setDescription(shot.description || '')
      setCameraAngle(shot.cameraAngle || '')
      setCameraMovement(shot.cameraMovement || '')
      setDurationSeconds(shot.durationSeconds || 5)
      setMediaType(shot.mediaType || 'image')
      setModelSlug(shot.modelSlug || '')
      setPrompt(shot.prompt || shot.aiSuggestedPrompt || '')
    }
  }, [shot])

  // Set default model when media type changes (if no model selected)
  useEffect(() => {
    if (!modelSlug || !availableModels.find(m => m.id === modelSlug)) {
      // Set default: seedream-4.5 for images, veo-3.1 for video
      const defaultModel = mediaType === 'video' ? 'veo-3.1' : 'seedream-4.5'
      const model = availableModels.find(m => m.id === defaultModel) || availableModels[0]
      if (model) {
        setModelSlug(model.id)
      }
    }
  }, [mediaType, availableModels])

  // Ensure duration is valid for selected model
  useEffect(() => {
    if (mediaType === 'video' && durationOptions.length > 0) {
      if (!durationOptions.includes(durationSeconds)) {
        setDurationSeconds(durationOptions[0])
      }
    }
  }, [mediaType, durationOptions, durationSeconds])

  const handleSave = async () => {
    if (!shot) return

    setIsSaving(true)
    try {
      await onSave(shot.id, {
        title: title || undefined,
        description,
        cameraAngle: cameraAngle || undefined,
        cameraMovement: cameraMovement || undefined,
        durationSeconds: mediaType === 'video' ? durationSeconds : undefined,
        mediaType,
        modelSlug: modelSlug || undefined,
        prompt: prompt || undefined,
      })
      onClose()
    } catch (error) {
      console.error('Failed to save shot:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!shot) return
    if (confirm('Are you sure you want to delete this shot?')) {
      await onDelete(shot.id)
      onClose()
    }
  }

  const handleGenerate = async () => {
    if (!shot) return
    // Save first, then generate
    await handleSave()
    await onGenerate(shot.id)
  }

  if (!mounted) return null

  const modalContent = (
    <AnimatePresence>
      {isOpen && shot && (
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
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-skinny-yellow/20 flex items-center justify-center">
                  <Film size={20} className="text-skinny-yellow" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Shot {shot.shotNumber}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {shot.status === 'completed' ? 'Generated' : 'Not generated'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Preview if generated */}
              {shot.generatedImageUrl && (
                <div className="aspect-video rounded-xl overflow-hidden bg-zinc-800">
                  <img
                    src={shot.generatedImageUrl}
                    alt={shot.title || `Shot ${shot.shotNumber}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Title (optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Hero's Entrance"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-skinny-yellow/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what happens in this shot..."
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-skinny-yellow/50 resize-none"
                  />
                </div>
              </div>

              {/* Camera Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    <Camera size={14} className="inline mr-1" />
                    Camera Angle
                  </label>
                  <select
                    value={cameraAngle}
                    onChange={(e) => setCameraAngle(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-skinny-yellow/50"
                  >
                    <option value="">Select angle</option>
                    {CAMERA_ANGLES.map(angle => (
                      <option key={angle} value={angle}>{angle}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Camera Movement
                  </label>
                  <select
                    value={cameraMovement}
                    onChange={(e) => setCameraMovement(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-skinny-yellow/50"
                  >
                    <option value="">Select movement</option>
                    {CAMERA_MOVEMENTS.map(movement => (
                      <option key={movement} value={movement}>{movement}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Media Type */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Media Type
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMediaType('image')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border transition-colors",
                      mediaType === 'image'
                        ? "bg-skinny-yellow/20 border-skinny-yellow text-skinny-yellow"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    )}
                  >
                    <Image size={16} />
                    Image
                  </button>
                  <button
                    onClick={() => setMediaType('video')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border transition-colors",
                      mediaType === 'video'
                        ? "bg-skinny-yellow/20 border-skinny-yellow text-skinny-yellow"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    )}
                  >
                    <Video size={16} />
                    Video
                  </button>
                </div>
              </div>

              {/* Model Selector */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  <Sparkles size={14} className="inline mr-1" />
                  Generation Model
                </label>
                <div className="relative">
                  <select
                    value={modelSlug}
                    onChange={(e) => setModelSlug(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-skinny-yellow/50 appearance-none cursor-pointer"
                  >
                    {availableModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
                {/* Model capabilities */}
                {selectedModel && (
                  <ModelCapabilities model={selectedModel} />
                )}
              </div>

              {/* Duration (Video only) */}
              {mediaType === 'video' && durationOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    <Clock size={14} className="inline mr-1" />
                    Duration
                  </label>
                  <div className="flex gap-2">
                    {durationOptions.map(d => (
                      <button
                        key={d}
                        onClick={() => setDurationSeconds(d)}
                        className={cn(
                          "flex-1 py-3 rounded-lg border text-sm font-medium transition-colors",
                          durationSeconds === d
                            ? "bg-skinny-yellow text-black border-skinny-yellow"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        )}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generation Prompt */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  <Sparkles size={14} className="inline mr-1" />
                  Generation Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Detailed prompt for generating this shot..."
                  rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-skinny-yellow/50 resize-none"
                />
                {shot.aiSuggestedPrompt && shot.aiSuggestedPrompt !== prompt && (
                  <button
                    onClick={() => setPrompt(shot.aiSuggestedPrompt || '')}
                    className="mt-2 text-xs text-skinny-yellow hover:underline"
                  >
                    Use AI suggested prompt
                  </button>
                )}
              </div>

              {/* Assigned Entities */}
              {shot.entities && shot.entities.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Entities in this shot
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {shot.entities.map((ref) => {
                      const entity = entities.find(e => e.id === ref.entityId)
                      if (!entity) return null
                      return (
                        <EntityTypeBadge
                          key={entity.id}
                          type={entity.entityType}
                          name={entity.entityName}
                          size="md"
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/50">
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
                Delete
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !description.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  <Save size={16} />
                  Save
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isSaving || !description.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-skinny-yellow text-black rounded-lg hover:bg-skinny-green transition-colors disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  Generate
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}
