'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  X,
  Search,
  Image,
  Folder,
  Check,
  User,
  Globe,
  Box,
  Palette,
  ArrowLeft,
  Sparkles,
} from 'lucide-react'
import { EntityType } from '@/lib/types'
import { EntityTypeBadge, getEntityTypeColor, getEntityTypeBgColor, getEntityTypeIcon, getEntityTypeLabel } from './entity-type-badge'
import { useGeneration, Generation } from '@/lib/context/generation-context'
import { useFolders, Folder as LibraryFolder } from '@/lib/context/folder-context'

interface EntityPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectGeneration: (generation: Generation, entityType: EntityType, entityName: string) => void
  onSelectFolder: (folder: LibraryFolder, entityType: EntityType, entityName: string) => void
  existingEntityIds?: string[]
}

type Step = 'source' | 'type' | 'name'
type Source = 'generation' | 'folder'

const ENTITY_TYPES: { type: EntityType; icon: typeof User; color: string; description: string }[] = [
  { type: 'character', icon: User, color: 'text-blue-400', description: 'People, creatures, or personas' },
  { type: 'world', icon: Globe, color: 'text-green-400', description: 'Environments and locations' },
  { type: 'object', icon: Box, color: 'text-orange-400', description: 'Props, items, and vehicles' },
  { type: 'style', icon: Palette, color: 'text-purple-400', description: 'Visual styles and aesthetics' },
]

export function EntityPickerModal({
  isOpen,
  onClose,
  onSelectGeneration,
  onSelectFolder,
  existingEntityIds = [],
}: EntityPickerModalProps) {
  const { generations } = useGeneration()
  const { folders } = useFolders()

  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<Source>('generation')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<LibraryFolder | null>(null)
  const [selectedType, setSelectedType] = useState<EntityType>('character')
  const [entityName, setEntityName] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('source')
      setSearchQuery('')
      setSelectedGeneration(null)
      setSelectedFolder(null)
      setSelectedType('character')
      setEntityName('')
    }
  }, [isOpen])

  // Filter generations - only ones with images
  const filteredGenerations = generations.filter(g => {
    if (!g.output_urls || g.output_urls.length === 0) return false
    const matchesSearch = g.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          g.studio_models?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  // Filter folders - optionally filter by entity type folders
  const filteredFolders = folders.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const handleSelectSource = (newSource: Source) => {
    setSource(newSource)
    setStep('source')
  }

  const handleSelectGeneration = (gen: Generation) => {
    setSelectedGeneration(gen)
    setSelectedFolder(null)
    setStep('type')
    // Pre-fill name from prompt
    const suggestedName = gen.prompt?.split(',')[0]?.slice(0, 30) || 'New Entity'
    setEntityName(suggestedName)
  }

  const handleSelectFolder = (folder: LibraryFolder) => {
    setSelectedFolder(folder)
    setSelectedGeneration(null)
    setStep('type')
    // Use folder name as default
    setEntityName(folder.name)
    // If folder has entity type, pre-select it
    if (folder.folder_type && folder.folder_type !== 'general') {
      setSelectedType(folder.folder_type as EntityType)
    }
  }

  const handleSelectType = (type: EntityType) => {
    setSelectedType(type)
    setStep('name')
  }

  const handleConfirm = useCallback(() => {
    if (!entityName.trim()) return

    if (selectedGeneration) {
      onSelectGeneration(selectedGeneration, selectedType, entityName.trim())
    } else if (selectedFolder) {
      onSelectFolder(selectedFolder, selectedType, entityName.trim())
    }

    onClose()
  }, [selectedGeneration, selectedFolder, selectedType, entityName, onSelectGeneration, onSelectFolder, onClose])

  const handleBack = () => {
    if (step === 'name') {
      setStep('type')
    } else if (step === 'type') {
      setStep('source')
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-full max-w-lg max-h-[85vh] flex flex-col bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                {step !== 'source' && (
                  <button
                    onClick={handleBack}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <h2 className="text-base font-semibold text-white">
                  {step === 'source' && 'Add Entity'}
                  {step === 'type' && 'Choose Entity Type'}
                  {step === 'name' && 'Name Your Entity'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                {/* Step 1: Select Source */}
                {step === 'source' && (
                  <motion.div
                    key="source"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    {/* Source Tabs */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => handleSelectSource('generation')}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors",
                          source === 'generation'
                            ? "bg-skinny-yellow text-black"
                            : "bg-zinc-800 text-zinc-400 hover:text-white"
                        )}
                      >
                        <Image size={16} />
                        Generations
                      </button>
                      <button
                        onClick={() => handleSelectSource('folder')}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors",
                          source === 'folder'
                            ? "bg-skinny-yellow text-black"
                            : "bg-zinc-800 text-zinc-400 hover:text-white"
                        )}
                      >
                        <Folder size={16} />
                        Folders
                      </button>
                    </div>

                    {/* Search */}
                    <div className="relative mb-4">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={source === 'generation' ? "Search generations..." : "Search folders..."}
                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600"
                      />
                    </div>

                    {/* Grid */}
                    {source === 'generation' ? (
                      <div className="grid grid-cols-3 gap-2">
                        {filteredGenerations.length === 0 ? (
                          <div className="col-span-3 py-8 text-center">
                            <p className="text-sm text-zinc-500">No generations found</p>
                          </div>
                        ) : (
                          filteredGenerations.slice(0, 12).map((gen) => (
                            <button
                              key={gen.id}
                              onClick={() => handleSelectGeneration(gen)}
                              className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-skinny-yellow transition-colors group relative"
                            >
                              <img
                                src={gen.output_urls[0]}
                                alt={gen.prompt || 'Generation'}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-xs text-white font-medium">Select</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredFolders.length === 0 ? (
                          <div className="py-8 text-center">
                            <p className="text-sm text-zinc-500">No folders found</p>
                          </div>
                        ) : (
                          filteredFolders.map((folder) => (
                            <button
                              key={folder.id}
                              onClick={() => handleSelectFolder(folder)}
                              className="w-full flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
                            >
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: `${folder.color}20` }}
                              >
                                <span className="text-lg">{folder.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white">{folder.name}</div>
                                <div className="text-xs text-zinc-500">
                                  {folder.folder_type !== 'general' ? (
                                    <span className="capitalize">{folder.folder_type}</span>
                                  ) : (
                                    'General folder'
                                  )}
                                </div>
                              </div>
                              {folder.folder_type && folder.folder_type !== 'general' && (
                                <EntityTypeBadge type={folder.folder_type as EntityType} size="sm" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Step 2: Select Type */}
                {step === 'type' && (
                  <motion.div
                    key="type"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    {/* Preview */}
                    <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-zinc-800/50">
                      {selectedGeneration && (
                        <>
                          <img
                            src={selectedGeneration.output_urls[0]}
                            alt="Selected"
                            className="w-14 h-14 rounded-lg object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">
                              {selectedGeneration.prompt?.slice(0, 50)}...
                            </p>
                            <p className="text-xs text-zinc-500">{selectedGeneration.studio_models?.name}</p>
                          </div>
                        </>
                      )}
                      {selectedFolder && (
                        <>
                          <div
                            className="w-14 h-14 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${selectedFolder.color}20` }}
                          >
                            <span className="text-2xl">{selectedFolder.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium">{selectedFolder.name}</p>
                            <p className="text-xs text-zinc-500">Folder</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Entity Types */}
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Entity Type</p>
                    <div className="space-y-2">
                      {ENTITY_TYPES.map(({ type, icon: Icon, color, description }) => (
                        <button
                          key={type}
                          onClick={() => handleSelectType(type)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                            selectedType === type
                              ? getEntityTypeBgColor(type)
                              : "bg-zinc-800/50 hover:bg-zinc-800"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            getEntityTypeBgColor(type)
                          )}>
                            <Icon size={20} className={color} />
                          </div>
                          <div className="flex-1">
                            <p className={cn(
                              "text-sm font-medium",
                              selectedType === type ? color : "text-white"
                            )}>
                              {getEntityTypeLabel(type)}
                            </p>
                            <p className="text-xs text-zinc-500">{description}</p>
                          </div>
                          {selectedType === type && (
                            <Check size={16} className={color} />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Name Entity */}
                {step === 'name' && (
                  <motion.div
                    key="name"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    {/* Preview */}
                    <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-zinc-800/50">
                      {selectedGeneration && (
                        <img
                          src={selectedGeneration.output_urls[0]}
                          alt="Selected"
                          className="w-14 h-14 rounded-lg object-cover"
                        />
                      )}
                      {selectedFolder && (
                        <div
                          className="w-14 h-14 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${selectedFolder.color}20` }}
                        >
                          <span className="text-2xl">{selectedFolder.icon}</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <EntityTypeBadge type={selectedType} showLabel />
                        <p className="text-xs text-zinc-500 mt-1">
                          {selectedGeneration ? 'From generation' : 'From folder'}
                        </p>
                      </div>
                    </div>

                    {/* Name Input */}
                    <div className="space-y-3">
                      <label className="block text-xs text-zinc-500 uppercase tracking-wider">
                        Entity Name
                      </label>
                      <input
                        type="text"
                        value={entityName}
                        onChange={(e) => setEntityName(e.target.value)}
                        placeholder="e.g., Hero Character, Forest World, Magic Sword..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-skinny-yellow transition-colors"
                        autoFocus
                      />
                      <p className="text-xs text-zinc-600">
                        Give your entity a memorable name for easy reference in shots
                      </p>
                    </div>

                    {/* Analyze hint */}
                    <div className="mt-6 p-3 rounded-lg bg-skinny-yellow/5 border border-skinny-yellow/20">
                      <div className="flex items-start gap-2">
                        <Sparkles size={14} className="text-skinny-yellow mt-0.5" />
                        <div>
                          <p className="text-xs text-skinny-yellow font-medium">AI Analysis Available</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            After adding, you can analyze the entity image with Gemini to get detailed visual descriptions for consistent prompts.
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-zinc-800 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              {step === 'name' && (
                <button
                  onClick={handleConfirm}
                  disabled={!entityName.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-skinny-yellow text-black hover:bg-skinny-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Entity
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
