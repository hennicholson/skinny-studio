'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Film, Camera, Clock, Video, Image, Save, Sparkles, Trash2, ChevronDown, ImagePlus, Play, Volume2, Check, Loader2, ImageOff, Layers } from 'lucide-react'
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
  shots: StoryboardShot[]  // All shots for reference selection
  entities: StoryboardEntity[]
  onSave: (shotId: string, updates: UpdateShotInput) => Promise<void>
  onDelete: (shotId: string) => Promise<void>
  onGenerate: (shotId: string, options?: { referenceImages?: string[] }) => Promise<void>
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
  shots,
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
  const [selectedReferenceShots, setSelectedReferenceShots] = useState<string[]>([])
  const [selectedReferenceEntities, setSelectedReferenceEntities] = useState<string[]>([])

  // Real cost estimation state
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)
  const [costLoading, setCostLoading] = useState(false)

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

  // Get completed shots for reference selection (excluding current shot)
  const completedShots = useMemo(() => {
    if (!shots || !shot) return []
    return shots.filter(s =>
      s.id !== shot.id &&
      s.status === 'completed' &&
      s.generatedImageUrl
    )
  }, [shots, shot])

  // Get entities with images for reference selection
  const entitiesWithImages = useMemo(() => {
    return entities.filter(e => e.primaryImageUrl)
  }, [entities])

  // Toggle reference shot selection (shared max with entities)
  const toggleReferenceShot = useCallback((shotId: string) => {
    const maxRefs = selectedModel?.maxReferenceImages || 4
    const totalSelected = selectedReferenceShots.length + selectedReferenceEntities.length
    setSelectedReferenceShots(prev => {
      if (prev.includes(shotId)) {
        return prev.filter(id => id !== shotId)
      }
      if (totalSelected >= maxRefs) {
        return prev // At max capacity
      }
      return [...prev, shotId]
    })
  }, [selectedModel, selectedReferenceShots.length, selectedReferenceEntities.length])

  // Toggle reference entity selection (shared max with shots)
  const toggleReferenceEntity = useCallback((entityId: string) => {
    const maxRefs = selectedModel?.maxReferenceImages || 4
    const totalSelected = selectedReferenceShots.length + selectedReferenceEntities.length
    setSelectedReferenceEntities(prev => {
      if (prev.includes(entityId)) {
        return prev.filter(id => id !== entityId)
      }
      if (totalSelected >= maxRefs) {
        return prev // At max capacity
      }
      return [...prev, entityId]
    })
  }, [selectedModel, selectedReferenceShots.length, selectedReferenceEntities.length])

  // Fetch real cost from API when model/duration changes
  useEffect(() => {
    if (!modelSlug) {
      setEstimatedCost(null)
      return
    }

    const fetchCost = async () => {
      setCostLoading(true)
      try {
        const res = await fetch('/api/estimate-cost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelSlug,
            duration: mediaType === 'video' ? durationSeconds : undefined,
          }),
        })
        const data = await res.json()
        if (data.costCents !== undefined) {
          setEstimatedCost(data.costCents)
        }
      } catch (error) {
        console.error('Failed to fetch cost:', error)
        // Fallback to rough estimate
        setEstimatedCost(mediaType === 'video' ? 50 : 10)
      } finally {
        setCostLoading(false)
      }
    }

    fetchCost()
  }, [modelSlug, mediaType, durationSeconds])

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
      setSelectedReferenceShots([]) // Reset reference selection
      setSelectedReferenceEntities([]) // Reset entity selection
    }
  }, [shot])

  // Clear model selection when media type changes if current model is incompatible
  // User must explicitly select a model - no defaults
  useEffect(() => {
    if (modelSlug && !availableModels.find(m => m.id === modelSlug)) {
      // Current model is not compatible with new media type - clear it
      setModelSlug('')
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

    // Collect reference URLs from selected shots
    const shotReferenceUrls = selectedReferenceShots
      .map(shotId => shots.find(s => s.id === shotId)?.generatedImageUrl)
      .filter((url): url is string => !!url)

    // Collect reference URLs from selected entities
    const entityReferenceUrls = selectedReferenceEntities
      .map(entityId => entities.find(e => e.id === entityId)?.primaryImageUrl)
      .filter((url): url is string => !!url)

    // Combine all references
    const referenceImages = [...shotReferenceUrls, ...entityReferenceUrls]

    console.log('[ShotEditModal] Reference images to pass:', {
      shotRefs: shotReferenceUrls,
      entityRefs: entityReferenceUrls,
      combined: referenceImages,
    })

    await onGenerate(shot.id, referenceImages.length > 0 ? { referenceImages } : undefined)
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
                  Generation Model *
                </label>
                <div className="relative">
                  <select
                    value={modelSlug}
                    onChange={(e) => setModelSlug(e.target.value)}
                    className={cn(
                      "w-full bg-zinc-800 border rounded-lg px-4 py-3 focus:outline-none appearance-none cursor-pointer",
                      modelSlug
                        ? "border-zinc-700 text-white focus:border-skinny-yellow/50"
                        : "border-orange-500/50 text-zinc-400"
                    )}
                  >
                    <option value="">Select a model...</option>
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
                {/* Cost estimation */}
                {selectedModel && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
                    <span className="text-sm text-zinc-400">Estimated cost:</span>
                    {costLoading ? (
                      <span className="flex items-center gap-2 text-sm text-zinc-500">
                        <Loader2 size={12} className="animate-spin" />
                        Loading...
                      </span>
                    ) : estimatedCost !== null ? (
                      <span className="text-sm font-medium text-skinny-yellow">
                        ~{estimatedCost}¢
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-500">--</span>
                    )}
                  </div>
                )}
                {/* No model selected warning */}
                {!modelSlug && (
                  <p className="text-xs text-orange-400 mt-2">
                    Please select a model to generate this shot
                  </p>
                )}
              </div>

              {/* Reference Images from Previous Shots */}
              {selectedModel?.capabilities.supportsReferenceImages && completedShots.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    <ImagePlus size={14} className="inline mr-1" />
                    Reference from Previous Shots
                  </label>
                  <p className="text-xs text-zinc-500 mb-3">
                    Select completed shots to use as style/consistency references
                  </p>
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {completedShots.map(refShot => {
                      const isSelected = selectedReferenceShots.includes(refShot.id)
                      const maxRefs = selectedModel?.maxReferenceImages || 4
                      const atCapacity = selectedReferenceShots.length >= maxRefs && !isSelected

                      return (
                        <button
                          key={refShot.id}
                          onClick={() => toggleReferenceShot(refShot.id)}
                          disabled={atCapacity}
                          className={cn(
                            "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                            isSelected
                              ? "border-skinny-yellow ring-2 ring-skinny-yellow/30"
                              : atCapacity
                              ? "border-zinc-800 opacity-50 cursor-not-allowed"
                              : "border-zinc-700 hover:border-zinc-600"
                          )}
                        >
                          <img
                            src={refShot.generatedImageUrl}
                            alt={refShot.title || `Shot ${refShot.shotNumber}`}
                            className="w-full h-full object-cover"
                          />
                          {/* Shot number badge */}
                          <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/60 text-[10px] font-medium text-white">
                            {refShot.shotNumber}
                          </div>
                          {/* Selected checkmark */}
                          {isSelected && (
                            <div className="absolute inset-0 bg-skinny-yellow/20 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full bg-skinny-yellow flex items-center justify-center">
                                <Check size={14} className="text-black" />
                              </div>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {selectedReferenceShots.length + selectedReferenceEntities.length} / {selectedModel?.maxReferenceImages || 4} references selected
                  </p>
                </div>
              )}

              {/* No completed shots message */}
              {selectedModel?.capabilities.supportsReferenceImages && completedShots.length === 0 && entitiesWithImages.length === 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <ImageOff size={16} className="text-zinc-500" />
                  <p className="text-xs text-zinc-500">
                    Generate some shots or add entities with images to use as references
                  </p>
                </div>
              )}

              {/* Reference from Entities */}
              {selectedModel?.capabilities.supportsReferenceImages && entitiesWithImages.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    <Layers size={14} className="inline mr-1" />
                    Reference from Entities
                  </label>
                  <p className="text-xs text-zinc-500 mb-3">
                    Select characters, worlds, objects, or styles as visual references
                  </p>
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {entitiesWithImages.map(entity => {
                      const isSelected = selectedReferenceEntities.includes(entity.id)
                      const maxRefs = selectedModel?.maxReferenceImages || 4
                      const totalSelected = selectedReferenceShots.length + selectedReferenceEntities.length
                      const atCapacity = totalSelected >= maxRefs && !isSelected

                      return (
                        <button
                          key={entity.id}
                          onClick={() => toggleReferenceEntity(entity.id)}
                          disabled={atCapacity}
                          className={cn(
                            "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                            isSelected
                              ? "border-skinny-yellow ring-2 ring-skinny-yellow/30"
                              : atCapacity
                              ? "border-zinc-800 opacity-50 cursor-not-allowed"
                              : "border-zinc-700 hover:border-zinc-600"
                          )}
                        >
                          <img
                            src={entity.primaryImageUrl}
                            alt={entity.entityName}
                            className="w-full h-full object-cover"
                          />
                          {/* Entity type badge */}
                          <div className="absolute top-1 left-1">
                            <EntityTypeBadge type={entity.entityType} size="sm" />
                          </div>
                          {/* Entity name */}
                          <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/70 text-[9px] text-white truncate">
                            {entity.entityName}
                          </div>
                          {/* Selected checkmark */}
                          {isSelected && (
                            <div className="absolute inset-0 bg-skinny-yellow/20 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full bg-skinny-yellow flex items-center justify-center">
                                <Check size={14} className="text-black" />
                              </div>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {completedShots.length === 0 && (
                    <p className="text-xs text-zinc-500 mt-2">
                      {selectedReferenceShots.length + selectedReferenceEntities.length} / {selectedModel?.maxReferenceImages || 4} references selected
                    </p>
                  )}
                </div>
              )}

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
                  disabled={isSaving || !description.trim() || !modelSlug}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                    !modelSlug
                      ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                      : "bg-skinny-yellow text-black hover:bg-skinny-green disabled:opacity-50"
                  )}
                >
                  <Sparkles size={16} />
                  {!modelSlug ? 'Select Model First' : 'Generate'}
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
