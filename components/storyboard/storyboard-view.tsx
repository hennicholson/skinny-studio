'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Plus, List, Clock, User, Globe, Box, Palette, ChevronRight, Settings, ChevronDown, MessageSquare, Layers, LayoutList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStoryboard } from '@/lib/context/storyboard-context'
import { useApp } from '@/lib/context/app-context'
import { EtherealBackground } from '@/components/ui/ethereal-background'
import { ModelSelector } from '@/components/ui/model-selector'
import { ShotListPanel } from './shot-list-panel'
import { TimelineStrip } from './timeline-strip'
import { EntityPanel } from './entity-panel'
import { EntityPickerModal } from './entity-picker-modal'
import { StoryboardChat } from './storyboard-chat'
import { ShotEditModal } from './shot-edit-modal'
import { StoryboardShot, StoryboardEntity, EntityType, UpdateShotInput } from '@/lib/types'
import { Folder as LibraryFolder } from '@/lib/context/folder-context'
import { Generation as ContextGeneration } from '@/lib/context/generation-context'
import { toast } from 'sonner'

// Mobile tab types
type MobileTab = 'shots' | 'entities' | 'timeline'

// Mobile tab bar component
function MobileTabBar({
  activeTab,
  onTabChange,
  shotCount,
  entityCount
}: {
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
  shotCount: number
  entityCount: number
}) {
  const tabs: { id: MobileTab; label: string; icon: typeof List; count?: number }[] = [
    { id: 'shots', label: 'Shots', icon: LayoutList, count: shotCount },
    { id: 'entities', label: 'Entities', icon: Layers, count: entityCount },
    { id: 'timeline', label: 'Timeline', icon: Film },
  ]

  return (
    <div className="flex-shrink-0 flex border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm md:hidden">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative",
            activeTab === tab.id
              ? "text-skinny-yellow"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <tab.icon size={16} />
          <span>{tab.label}</span>
          {tab.count !== undefined && tab.count > 0 && (
            <span className={cn(
              "text-xs px-1.5 rounded-full",
              activeTab === tab.id
                ? "bg-skinny-yellow/20 text-skinny-yellow"
                : "bg-zinc-800 text-zinc-500"
            )}>
              {tab.count}
            </span>
          )}
          {activeTab === tab.id && (
            <motion.div
              layoutId="mobile-tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-skinny-yellow"
            />
          )}
        </button>
      ))}
    </div>
  )
}

// Floating action button for quick actions
function FloatingActionButton({
  onAddShot,
  onAddEntity,
  activeTab
}: {
  onAddShot: () => void
  onAddEntity: () => void
  activeTab: MobileTab
}) {
  const [isOpen, setIsOpen] = useState(false)

  const handleAction = () => {
    if (activeTab === 'shots') {
      onAddShot()
    } else if (activeTab === 'entities') {
      onAddEntity()
    } else {
      setIsOpen(!isOpen)
    }
  }

  return (
    <div className="absolute bottom-4 right-4 z-30 md:hidden">
      <AnimatePresence>
        {isOpen && activeTab === 'timeline' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-14 right-0 flex flex-col gap-2 items-end"
          >
            <button
              onClick={() => { onAddShot(); setIsOpen(false) }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 text-white text-sm shadow-lg"
            >
              <Plus size={14} />
              Add Shot
            </button>
            <button
              onClick={() => { onAddEntity(); setIsOpen(false) }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 text-white text-sm shadow-lg"
            >
              <Plus size={14} />
              Add Entity
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleAction}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors",
          isOpen
            ? "bg-zinc-700 rotate-45"
            : "bg-skinny-yellow"
        )}
      >
        <Plus
          size={24}
          className={cn(
            "transition-all",
            isOpen ? "text-white rotate-45" : "text-black"
          )}
        />
      </motion.button>
    </div>
  )
}

// Storyboard selector dropdown with click-outside handling
function StoryboardSelector({
  storyboards,
  currentId,
  onSelect,
  onCreate
}: {
  storyboards: any[]
  currentId?: string
  onSelect: (id: string) => void
  onCreate: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const current = storyboards.find(s => s.id === currentId)

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-storyboard-selector]')) {
        setIsOpen(false)
      }
    }

    // Add listener with a small delay to avoid closing on the same click
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 10)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isOpen])

  const handleCreate = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onCreate()
    setIsOpen(false)
  }

  const handleSelect = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(id)
    setIsOpen(false)
  }

  return (
    <div className="relative" data-storyboard-selector>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
      >
        <Film size={16} className="text-skinny-yellow" />
        <span className="text-sm font-medium text-white truncate max-w-[200px]">
          {current?.title || 'Select Storyboard'}
        </span>
        <ChevronRight size={14} className={cn("text-zinc-500 transition-transform", isOpen && "rotate-90")} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to catch clicks */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-zinc-800">
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-skinny-yellow hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <Plus size={14} />
                New Storyboard
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {storyboards.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">No storyboards yet</p>
              ) : (
                storyboards.map(sb => (
                  <button
                    key={sb.id}
                    onClick={(e) => handleSelect(sb.id, e)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left",
                      sb.id === currentId
                        ? "bg-skinny-yellow/10 text-skinny-yellow"
                        : "text-white hover:bg-zinc-800"
                    )}
                  >
                    <Film size={14} className={sb.id === currentId ? "text-skinny-yellow" : "text-zinc-500"} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{sb.title}</div>
                      <div className="text-xs text-zinc-500">
                        {sb.totalShots} shots · {sb.completedShots} done
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

// Welcome screen for storyboard mode
function StoryboardWelcome({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 relative animate-fadeIn">
      <div className="flex flex-col items-center text-center max-w-lg">
        <div className="w-20 h-20 rounded-2xl bg-skinny-yellow/10 flex items-center justify-center mb-6 animate-float">
          <Film size={40} className="text-skinny-yellow" />
        </div>

        <h1 className="text-3xl font-semibold text-white mb-2">Storyboard Mode</h1>

        <div className="h-px w-24 bg-gradient-to-r from-transparent via-skinny-yellow/40 to-transparent mb-4" />

        <p className="text-sm text-zinc-400 mb-8 max-w-md">
          Plan multi-shot creative projects with AI assistance.
          Define characters, worlds, and styles to maintain visual consistency across your shots.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-8 text-left">
          {[
            { icon: User, label: 'Characters', desc: 'Define recurring characters' },
            { icon: Globe, label: 'Worlds', desc: 'Create consistent environments' },
            { icon: Box, label: 'Objects', desc: 'Reusable props and items' },
            { icon: Palette, label: 'Styles', desc: 'Visual style references' },
          ].map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]"
            >
              <Icon size={16} className="text-skinny-yellow mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-zinc-500">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-skinny-yellow text-black font-medium hover:bg-skinny-green transition-colors"
        >
          <Plus size={18} />
          Create Your First Storyboard
        </button>
      </div>
    </div>
  )
}

export function StoryboardView() {
  const {
    storyboards,
    currentStoryboard,
    shots,
    entities,
    isLoading,
    createStoryboard,
    loadStoryboard,
    fetchStoryboards,
    addShot,
    updateShot,
    deleteShot,
    reorderShots,
    addEntity,
    updateEntity,
    removeEntity,
    analyzeEntityImage,
    generateShot,
  } = useStoryboard()

  const { models, selectedModel, setSelectedModel, recentModels } = useApp()
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [selectedShotId, setSelectedShotId] = useState<string | undefined>()
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>()
  const [showEntityPicker, setShowEntityPicker] = useState(false)
  const [showShotEditModal, setShowShotEditModal] = useState(false)
  const [editingShot, setEditingShot] = useState<StoryboardShot | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('shots')

  // Load storyboards on mount
  useEffect(() => {
    fetchStoryboards()
  }, [fetchStoryboards])

  const handleCreateStoryboard = async () => {
    const sb = await createStoryboard({
      title: 'Untitled Storyboard',
    })
    if (sb) {
      await loadStoryboard(sb.id)
    }
  }

  const handleSelectStoryboard = async (id: string) => {
    await loadStoryboard(id)
    setSelectedShotId(undefined)
    setSelectedEntityId(undefined)
  }

  // Shot handlers
  const handleAddShot = useCallback(async () => {
    if (!currentStoryboard) return
    const newShot = await addShot({
      description: 'New shot',
      mediaType: 'image',
      durationSeconds: 5,
    })
    if (newShot) {
      setSelectedShotId(newShot.id)
      toast.success('Shot added')
    }
  }, [currentStoryboard, addShot])

  const handleEditShot = useCallback((shot: StoryboardShot) => {
    setSelectedShotId(shot.id)
    setEditingShot(shot)
    setShowShotEditModal(true)
  }, [])

  const handleSaveShot = useCallback(async (shotId: string, updates: UpdateShotInput) => {
    await updateShot(shotId, updates)
    toast.success('Shot saved')
  }, [updateShot])

  const handleDeleteShot = useCallback(async (shotId: string) => {
    await deleteShot(shotId)
    if (selectedShotId === shotId) {
      setSelectedShotId(undefined)
    }
    toast.success('Shot deleted')
  }, [deleteShot, selectedShotId])

  const handleReorderShots = useCallback(async (orderedIds: string[]) => {
    await reorderShots(orderedIds)
  }, [reorderShots])

  const handleGenerateShot = useCallback(async (shotId: string) => {
    toast.loading('Generating shot...', { id: `gen-${shotId}` })
    try {
      await generateShot(shotId)
      toast.success('Shot generated!', { id: `gen-${shotId}` })
    } catch (error) {
      toast.error('Failed to generate shot', { id: `gen-${shotId}` })
    }
  }, [generateShot])

  // Entity handlers
  const handleAddEntity = useCallback(() => {
    setShowEntityPicker(true)
  }, [])

  const handleEditEntity = useCallback((entity: StoryboardEntity) => {
    setSelectedEntityId(entity.id)
    // TODO: Open entity edit modal
  }, [])

  const handleDeleteEntity = useCallback(async (entityId: string) => {
    await removeEntity(entityId)
    if (selectedEntityId === entityId) {
      setSelectedEntityId(undefined)
    }
    toast.success('Entity removed')
  }, [removeEntity, selectedEntityId])

  const handleAnalyzeEntity = useCallback(async (entityId: string) => {
    try {
      await analyzeEntityImage(entityId)
      toast.success('Entity analyzed!')
    } catch (error) {
      toast.error('Failed to analyze entity')
    }
  }, [analyzeEntityImage])

  const handleViewEntity = useCallback((entity: StoryboardEntity) => {
    setSelectedEntityId(entity.id)
    // TODO: Open entity view modal
  }, [])

  // Entity picker handlers
  const handleSelectGenerationAsEntity = useCallback(async (
    generation: ContextGeneration,
    entityType: EntityType,
    entityName: string
  ) => {
    if (!currentStoryboard) return

    const imageUrl = generation.output_urls?.[0] || ''
    if (!imageUrl) {
      toast.error('Generation has no image')
      return
    }

    try {
      const newEntity = await addEntity({
        entityType,
        entityName,
        generationId: generation.id,
        imageUrl,
      })

      if (newEntity) {
        setSelectedEntityId(newEntity.id)
        toast.success(`${entityName} added as ${entityType}`)

        // Analyze the entity image
        toast.loading('Analyzing entity...', { id: `analyze-${newEntity.id}` })
        try {
          await analyzeEntityImage(newEntity.id)
          toast.success('Entity analyzed!', { id: `analyze-${newEntity.id}` })
        } catch (error) {
          toast.dismiss(`analyze-${newEntity.id}`)
        }
      }
    } catch (error) {
      toast.error('Failed to add entity')
    }
  }, [currentStoryboard, addEntity, analyzeEntityImage])

  const handleSelectFolderAsEntity = useCallback(async (
    folder: LibraryFolder,
    entityType: EntityType,
    entityName: string
  ) => {
    if (!currentStoryboard) return

    try {
      const newEntity = await addEntity({
        entityType,
        entityName,
        folderId: folder.id,
        imageUrl: '', // Will be filled from folder contents
      })

      if (newEntity) {
        setSelectedEntityId(newEntity.id)
        toast.success(`${entityName} added as ${entityType}`)
      }
    } catch (error) {
      toast.error('Failed to add entity')
    }
  }, [currentStoryboard, addEntity])

  // Show welcome screen if no storyboards
  if (storyboards.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">
        <EtherealBackground color="rgba(214, 252, 81, 0.08)" scale={50} speed={20} />

        {/* Mode Selector in Welcome Screen */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => setShowModelSelector(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors backdrop-blur-sm"
          >
            <Film size={14} className="text-skinny-yellow" />
            <span className="text-sm font-medium text-white">Storyboard</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>
        </div>

        <StoryboardWelcome onCreate={handleCreateStoryboard} />

        {/* Model Selector Modal */}
        <ModelSelector
          isOpen={showModelSelector}
          onClose={() => setShowModelSelector(false)}
          models={models}
          selectedModelId={selectedModel?.id || 'storyboard-mode'}
          onSelectModel={(modelId) => {
            const model = models.find(m => m.id === modelId)
            if (model) {
              setSelectedModel(model)
            }
          }}
          recentModelIds={recentModels}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <StoryboardSelector
            storyboards={storyboards}
            currentId={currentStoryboard?.id}
            onSelect={handleSelectStoryboard}
            onCreate={handleCreateStoryboard}
          />

          {currentStoryboard && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <List size={12} />
              <span>{shots.length} shots</span>
              <span className="text-zinc-700">·</span>
              <span>{entities.length} entities</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Model/Mode Selector Button */}
          <button
            onClick={() => setShowModelSelector(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
          >
            <Film size={14} className="text-skinny-yellow" />
            <span className="text-sm font-medium text-white">Storyboard</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>

          <button className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {!currentStoryboard ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 text-sm">Select a storyboard to continue</p>
        </div>
      ) : (
        <>
          {/* Mobile Tab Bar */}
          <MobileTabBar
            activeTab={mobileTab}
            onTabChange={setMobileTab}
            shotCount={shots.length}
            entityCount={entities.length}
          />

          {/* Desktop Layout - 3 column split */}
          <div className="flex-1 hidden md:flex overflow-hidden">
            {/* Shot List Panel */}
            <div className="w-80 border-r border-zinc-800 flex flex-col">
              <ShotListPanel
                shots={shots}
                entities={entities}
                onAddShot={handleAddShot}
                onEditShot={handleEditShot}
                onDeleteShot={handleDeleteShot}
                onReorderShots={handleReorderShots}
                onGenerateShot={handleGenerateShot}
                selectedShotId={selectedShotId}
                onSelectShot={setSelectedShotId}
                isLoading={isLoading}
              />
            </div>

            {/* Chat Panel */}
            <div className="flex-1 flex flex-col">
              <StoryboardChat />
            </div>

            {/* Entity Panel */}
            <div className="w-72 border-l border-zinc-800 flex flex-col">
              <EntityPanel
                entities={entities}
                onAddEntity={handleAddEntity}
                onEditEntity={handleEditEntity}
                onDeleteEntity={handleDeleteEntity}
                onAnalyzeEntity={handleAnalyzeEntity}
                onViewEntity={handleViewEntity}
                selectedEntityId={selectedEntityId}
                onSelectEntity={setSelectedEntityId}
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Mobile Layout - Tabbed content */}
          <div className="flex-1 flex flex-col overflow-hidden md:hidden relative">
            <AnimatePresence mode="wait">
              {mobileTab === 'shots' && (
                <motion.div
                  key="shots"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <ShotListPanel
                    shots={shots}
                    entities={entities}
                    onAddShot={handleAddShot}
                    onEditShot={handleEditShot}
                    onDeleteShot={handleDeleteShot}
                    onReorderShots={handleReorderShots}
                    onGenerateShot={handleGenerateShot}
                    selectedShotId={selectedShotId}
                    onSelectShot={setSelectedShotId}
                    isLoading={isLoading}
                  />
                </motion.div>
              )}

              {mobileTab === 'entities' && (
                <motion.div
                  key="entities"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <EntityPanel
                    entities={entities}
                    onAddEntity={handleAddEntity}
                    onEditEntity={handleEditEntity}
                    onDeleteEntity={handleDeleteEntity}
                    onAnalyzeEntity={handleAnalyzeEntity}
                    onViewEntity={handleViewEntity}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={setSelectedEntityId}
                    isLoading={isLoading}
                  />
                </motion.div>
              )}

              {mobileTab === 'timeline' && (
                <motion.div
                  key="timeline"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex flex-col overflow-hidden p-4"
                >
                  {/* Expanded mobile timeline view */}
                  <div className="flex-1 overflow-auto">
                    <div className="grid grid-cols-2 gap-3">
                      {shots.map((shot, index) => (
                        <motion.div
                          key={shot.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          onClick={() => {
                            setSelectedShotId(shot.id)
                            setMobileTab('shots')
                          }}
                          className={cn(
                            "relative aspect-video rounded-lg overflow-hidden cursor-pointer transition-all",
                            "border-2",
                            selectedShotId === shot.id
                              ? "border-skinny-yellow ring-2 ring-skinny-yellow/30"
                              : "border-zinc-800 hover:border-zinc-700"
                          )}
                        >
                          {shot.generatedImageUrl ? (
                            <img
                              src={shot.generatedImageUrl}
                              alt={shot.title || `Shot ${shot.shotNumber}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                              <div className="text-center">
                                <Film size={24} className="text-zinc-700 mx-auto mb-1" />
                                <span className="text-xs text-zinc-600">Shot {shot.shotNumber}</span>
                              </div>
                            </div>
                          )}
                          {/* Shot number badge */}
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-xs font-medium text-white">
                            {shot.shotNumber}
                          </div>
                          {/* Status indicator */}
                          {shot.status === 'generating' && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-skinny-yellow border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          {shot.status === 'completed' && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500/80 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </motion.div>
                      ))}

                      {/* Add shot placeholder */}
                      {shots.length === 0 && (
                        <motion.button
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={handleAddShot}
                          className="aspect-video rounded-lg border-2 border-dashed border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-zinc-500 transition-colors col-span-2"
                        >
                          <div className="text-center">
                            <Plus size={24} className="mx-auto mb-1" />
                            <span className="text-sm">Add your first shot</span>
                          </div>
                        </motion.button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating Action Button */}
            <FloatingActionButton
              onAddShot={handleAddShot}
              onAddEntity={handleAddEntity}
              activeTab={mobileTab}
            />
          </div>

          {/* Timeline Strip - Desktop only (shown at bottom) */}
          <div className="hidden md:block">
            <TimelineStrip
              shots={shots}
              entities={entities}
              selectedShotId={selectedShotId}
              onSelectShot={setSelectedShotId}
              onGenerateShot={handleGenerateShot}
              isLoading={isLoading}
            />
          </div>
        </>
      )}

      {/* Model Selector Modal */}
      <ModelSelector
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        models={models}
        selectedModelId={selectedModel?.id || 'storyboard-mode'}
        onSelectModel={(modelId) => {
          const model = models.find(m => m.id === modelId)
          if (model) {
            setSelectedModel(model)
          }
        }}
        recentModelIds={recentModels}
      />

      {/* Entity Picker Modal */}
      <EntityPickerModal
        isOpen={showEntityPicker}
        onClose={() => setShowEntityPicker(false)}
        onSelectGeneration={handleSelectGenerationAsEntity}
        onSelectFolder={handleSelectFolderAsEntity}
        existingEntityIds={entities.map(e => e.id)}
      />

      {/* Shot Edit Modal */}
      <ShotEditModal
        isOpen={showShotEditModal}
        onClose={() => {
          setShowShotEditModal(false)
          setEditingShot(null)
        }}
        shot={editingShot}
        entities={entities}
        onSave={handleSaveShot}
        onDelete={handleDeleteShot}
        onGenerate={handleGenerateShot}
      />
    </div>
  )
}
