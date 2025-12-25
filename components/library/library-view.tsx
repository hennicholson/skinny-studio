'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import {
  Images,
  Search,
  Loader2,
  Download,
  ExternalLink,
  X,
  Video,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useGeneration, Generation } from '@/lib/context/generation-context'
import { useFolders, Folder } from '@/lib/context/folder-context'
import { useDragState, DragItem } from '@/lib/hooks/use-drag-state'
import { LibrarySidebar, SmartFolder } from './sidebar'
import { GenerationItem } from './generation-item'
import { FolderIconComponent } from './folder-icon'
import {
  ContextMenu,
  buildDesktopMenuItems,
  buildGenerationMenuItems,
  buildFolderMenuItems,
} from './context-menu'
import { NewFolderDialog } from './new-folder-dialog'
import { RenameFolderDialog } from './rename-folder-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'
import { SavedPromptsView } from './saved-prompts-view'
import { useSavedPrompts } from '@/lib/context/saved-prompts-context'

// Helper to detect if a URL is a video
function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
  const lowerUrl = url.toLowerCase()
  return videoExtensions.some(ext => lowerUrl.includes(ext))
}

// Helper to detect if a generation is a video
function isVideoGeneration(gen: Generation): boolean {
  if (gen.model_category === 'video') return true
  if (gen.output_urls?.some(url => isVideoUrl(url))) return true
  return false
}

export function LibraryView() {
  // Contexts
  const {
    allGenerations,
    isLoading: generationsLoading,
    error,
    refreshGenerations,
    moveGeneration,
    deleteGeneration,
    getUnfiledGenerations,
    getGenerationsByFolder,
  } = useGeneration()

  const {
    folders,
    activeFolder,
    isLoading: foldersLoading,
    unfiledCount,
    setActiveFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    refreshFolders,
    updateFolderCounts,
  } = useFolders()

  // Saved prompts
  const { prompts: savedPrompts, refreshPrompts } = useSavedPrompts()

  // Drag state
  const dragState = useDragState()

  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGeneration, setSelectedGeneration] = useState<{ gen: Generation; imageIdx: number } | null>(null)
  const [activeSmartFolder, setActiveSmartFolder] = useState<SmartFolder>('desktop')
  const [isEntering, setIsEntering] = useState(true)

  // Entrance animation - give content time to load before revealing
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsEntering(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    type: 'desktop' | 'generation' | 'folder'
    data?: Generation | Folder
  }>({ isOpen: false, position: { x: 0, y: 0 }, type: 'desktop' })

  // Dialog states
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [renameFolderDialog, setRenameFolderDialog] = useState<{ isOpen: boolean; folder: Folder | null }>({
    isOpen: false,
    folder: null,
  })
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void | Promise<void>
    danger: boolean
  }>({ isOpen: false, title: '', message: '', confirmLabel: '', onConfirm: () => {}, danger: false })

  const isLoading = generationsLoading || foldersLoading

  // Smart folder counts
  const smartFolderCounts = useMemo(() => {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    return {
      all: allGenerations.length,
      desktop: allGenerations.filter(g => !g.folder_id).length,
      recents: allGenerations.filter(g => new Date(g.created_at) > sevenDaysAgo).length,
      images: allGenerations.filter(g => !isVideoGeneration(g)).length,
      videos: allGenerations.filter(g => isVideoGeneration(g)).length,
      prompts: savedPrompts.length,
    }
  }, [allGenerations, savedPrompts])

  // Get current view data based on smart folder or user folder
  const currentGenerations = useMemo(() => {
    // If viewing a user folder
    if (activeFolder) {
      return getGenerationsByFolder(activeFolder)
    }

    // Smart folder filtering
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    switch (activeSmartFolder) {
      case 'all':
        return allGenerations
      case 'desktop':
        return allGenerations.filter(g => !g.folder_id)
      case 'recents':
        return allGenerations.filter(g => new Date(g.created_at) > sevenDaysAgo)
      case 'images':
        return allGenerations.filter(g => !isVideoGeneration(g))
      case 'videos':
        return allGenerations.filter(g => isVideoGeneration(g))
      case 'prompts':
        return [] // Prompts are handled separately in SavedPromptsView
      default:
        return allGenerations
    }
  }, [activeFolder, activeSmartFolder, allGenerations, getGenerationsByFolder])

  // Get folder preview URLs (first 4 images for each folder)
  const folderPreviewUrls = useMemo(() => {
    const previews: Record<string, string[]> = {}
    folders.forEach(folder => {
      const folderGens = getGenerationsByFolder(folder.id)
      previews[folder.id] = folderGens
        .slice(0, 4)
        .map(g => g.output_urls?.[0])
        .filter((url): url is string => !!url)
    })
    return previews
  }, [folders, getGenerationsByFolder])

  // Filter by search
  const filteredGenerations = searchQuery
    ? currentGenerations.filter(g =>
        g.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.model_slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.studio_models?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : currentGenerations

  // Navigation functions for arrow key support
  const navigatePrevious = useCallback(() => {
    if (!selectedGeneration) return

    const currentGen = selectedGeneration.gen
    const currentImageIdx = selectedGeneration.imageIdx
    const genIndex = filteredGenerations.findIndex(g => g.id === currentGen.id)

    // First, try navigating within the current generation (multi-image)
    if (currentImageIdx > 0) {
      setSelectedGeneration({ gen: currentGen, imageIdx: currentImageIdx - 1 })
      return
    }

    // Otherwise, go to the previous generation's last image
    if (genIndex > 0) {
      const prevGen = filteredGenerations[genIndex - 1]
      const lastImageIdx = Math.max(0, (prevGen.output_urls?.length || 1) - 1)
      setSelectedGeneration({ gen: prevGen, imageIdx: lastImageIdx })
    }
    // At boundary - do nothing (no wrap)
  }, [selectedGeneration, filteredGenerations])

  const navigateNext = useCallback(() => {
    if (!selectedGeneration) return

    const currentGen = selectedGeneration.gen
    const currentImageIdx = selectedGeneration.imageIdx
    const genIndex = filteredGenerations.findIndex(g => g.id === currentGen.id)
    const imageCount = currentGen.output_urls?.length || 1

    // First, try navigating within the current generation (multi-image)
    if (currentImageIdx < imageCount - 1) {
      setSelectedGeneration({ gen: currentGen, imageIdx: currentImageIdx + 1 })
      return
    }

    // Otherwise, go to the next generation's first image
    if (genIndex < filteredGenerations.length - 1) {
      const nextGen = filteredGenerations[genIndex + 1]
      setSelectedGeneration({ gen: nextGen, imageIdx: 0 })
    }
    // At boundary - do nothing (no wrap)
  }, [selectedGeneration, filteredGenerations])

  // Keyboard navigation for modal
  useEffect(() => {
    if (!selectedGeneration) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setSelectedGeneration(null)
          break
        case 'ArrowLeft':
          e.preventDefault()
          navigatePrevious()
          break
        case 'ArrowRight':
          e.preventDefault()
          navigateNext()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedGeneration, navigatePrevious, navigateNext])

  // Calculate total position for indicator
  const positionInfo = useMemo(() => {
    if (!selectedGeneration) return null

    const currentGen = selectedGeneration.gen
    const genIndex = filteredGenerations.findIndex(g => g.id === currentGen.id)

    // Calculate total items across all generations
    let currentPosition = 0
    for (let i = 0; i < genIndex; i++) {
      currentPosition += filteredGenerations[i].output_urls?.length || 1
    }
    currentPosition += selectedGeneration.imageIdx + 1

    const totalItems = filteredGenerations.reduce(
      (sum, g) => sum + (g.output_urls?.length || 1),
      0
    )

    return { current: currentPosition, total: totalItems }
  }, [selectedGeneration, filteredGenerations])

  // Check if at navigation boundaries
  const canNavigatePrevious = useMemo(() => {
    if (!selectedGeneration) return false
    const genIndex = filteredGenerations.findIndex(g => g.id === selectedGeneration.gen.id)
    return genIndex > 0 || selectedGeneration.imageIdx > 0
  }, [selectedGeneration, filteredGenerations])

  const canNavigateNext = useMemo(() => {
    if (!selectedGeneration) return false
    const genIndex = filteredGenerations.findIndex(g => g.id === selectedGeneration.gen.id)
    const imageCount = selectedGeneration.gen.output_urls?.length || 1
    return genIndex < filteredGenerations.length - 1 || selectedGeneration.imageIdx < imageCount - 1
  }, [selectedGeneration, filteredGenerations])

  // Get title for current view
  const currentViewTitle = useMemo(() => {
    if (activeFolder) {
      return folders.find(f => f.id === activeFolder)?.name || 'Folder'
    }
    switch (activeSmartFolder) {
      case 'all': return 'All'
      case 'desktop': return 'Desktop'
      case 'recents': return 'Recents'
      case 'images': return 'Images'
      case 'videos': return 'Videos'
      case 'prompts': return 'Saved Prompts'
      default: return 'Library'
    }
  }, [activeFolder, activeSmartFolder, folders])

  // Handlers
  const handleSelectSmartFolder = (folder: SmartFolder) => {
    setActiveFolder(null) // Clear user folder selection
    setActiveSmartFolder(folder)
  }

  const handleSelectUserFolder = (folderId: string) => {
    setActiveFolder(folderId)
  }

  const handleContextMenu = (e: React.MouseEvent, type: 'desktop' | 'generation' | 'folder', data?: Generation | Folder) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      type,
      data,
    })
  }

  const handleMoveToFolder = useCallback(async (item: DragItem, targetFolderId: string | null) => {
    if (item.type === 'generation') {
      const targetName = targetFolderId
        ? folders.find(f => f.id === targetFolderId)?.name || 'folder'
        : 'Desktop'
      const success = await moveGeneration(item.id, targetFolderId)
      if (success) {
        updateFolderCounts(item.sourceFolderId, targetFolderId)
        toast.success(`Moved to ${targetName}`)
      } else {
        toast.error('Failed to move item')
      }
    }
  }, [moveGeneration, updateFolderCounts, folders])

  const handleDownload = async (url: string, prompt: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      const ext = isVideoUrl(url) ? '.mp4' : '.png'
      a.download = `skinny-${prompt?.slice(0, 20) || 'media'}-${Date.now()}${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const handleDownloadAll = async (gen: Generation) => {
    for (const url of gen.output_urls || []) {
      await handleDownload(url, gen.prompt)
    }
  }

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt || '')
    toast.success('Prompt copied to clipboard')
  }

  const handleDeleteGeneration = async (gen: Generation) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Generation',
      message: 'Are you sure you want to delete this generation? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/generations/${gen.id}`, { method: 'DELETE' })
          if (res.ok) {
            deleteGeneration(gen.id)
            if (gen.folder_id) {
              updateFolderCounts(gen.folder_id, null)
            }
            toast.success('Generation deleted')
          } else {
            toast.error('Failed to delete generation')
          }
        } catch (err) {
          console.error('Delete failed:', err)
          toast.error('Failed to delete generation')
        }
      },
    })
  }

  const handleDeleteFolder = (folder: Folder) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Folder',
      message: `Delete "${folder.name}"? Items inside will be moved to your library.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const success = await deleteFolder(folder.id)
        if (success) {
          toast.success(`Deleted "${folder.name}"`)
        } else {
          toast.error('Failed to delete folder')
        }
      },
    })
  }

  const handleShareToGallery = async (gen: Generation) => {
    try {
      // Build headers with Whop auth
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) headers['x-whop-user-token'] = devToken
        if (devUserId) headers['x-whop-user-id'] = devUserId
      }

      const response = await fetch('/api/gallery/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          generationId: gen.id,
          title: gen.prompt?.slice(0, 100) || 'Untitled',
          description: gen.prompt || '',
          tags: [],
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Shared to Creator Gallery!', {
          action: {
            label: 'View Gallery',
            onClick: () => window.location.href = '/gallery',
          },
        })
      } else if (response.status === 400 && data.galleryId) {
        toast.info('Already shared to gallery')
      } else {
        toast.error(data.error || 'Failed to share')
      }
    } catch (err) {
      console.error('Share to gallery failed:', err)
      toast.error('Failed to share to gallery')
    }
  }

  const handleRefresh = () => {
    refreshGenerations()
    refreshFolders()
    refreshPrompts()
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Build context menu items
  const getContextMenuItems = () => {
    switch (contextMenu.type) {
      case 'desktop':
        return buildDesktopMenuItems(() => setShowNewFolderDialog(true))

      case 'generation':
        const gen = contextMenu.data as Generation
        return buildGenerationMenuItems(
          folders,
          gen.folder_id || null,
          {
            onDownload: () => handleDownload(gen.output_urls?.[0] || '', gen.prompt),
            onDownloadAll: gen.output_urls?.length > 1 ? () => handleDownloadAll(gen) : undefined,
            onCopyPrompt: () => handleCopyPrompt(gen.prompt),
            onMoveTo: (folderId) => handleMoveToFolder(
              { id: gen.id, type: 'generation', sourceFolderId: gen.folder_id || null },
              folderId
            ),
            onDelete: () => handleDeleteGeneration(gen),
            onShareToGallery: () => handleShareToGallery(gen),
          },
          gen.output_urls?.length > 1
        )

      case 'folder':
        const folder = contextMenu.data as Folder
        return buildFolderMenuItems(
          () => setRenameFolderDialog({ isOpen: true, folder }),
          () => handleDeleteFolder(folder)
        )

      default:
        return []
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <LibrarySidebar
        activeSmartFolder={activeFolder ? null : activeSmartFolder}
        onSelectSmartFolder={handleSelectSmartFolder}
        smartFolderCounts={smartFolderCounts}
        folders={folders}
        activeFolder={activeFolder}
        onSelectFolder={handleSelectUserFolder}
        onNewFolder={() => setShowNewFolderDialog(true)}
        onFolderContextMenu={(e, folder) => handleContextMenu(e, 'folder', folder)}
        isDragging={dragState.isDragging}
        dropTarget={dragState.dropTarget}
        getDropHandlers={dragState.getDropHandlers}
        onMoveToFolder={handleMoveToFolder}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-visible">
        {/* Header */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-white/[0.06] bg-zinc-950/50 relative z-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-white">{currentViewTitle}</h2>
              <span className="text-sm text-zinc-500">
                {filteredGenerations.length} {filteredGenerations.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 sm:flex-none">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full sm:w-56 bg-white/5 border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
              <button
                onClick={handleRefresh}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Grid with Pull-to-Refresh on mobile */}
        <PullToRefresh
          className="flex-1 p-4 sm:p-6"
          onRefresh={async () => {
            await new Promise(resolve => setTimeout(resolve, 500)) // Small delay for UX
            handleRefresh()
          }}
        >
          <div
            onContextMenu={(e) => {
              const target = e.target as HTMLElement
              if (target.closest('[data-item]')) return
              handleContextMenu(e, 'desktop')
            }}
          >
          {isLoading || isEntering ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={32} className="text-skinny-yellow animate-spin mb-4" />
              <p className="text-zinc-500 text-sm">{isEntering ? 'Preparing library...' : 'Loading your library...'}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 shadow-lg flex items-center justify-center mb-4">
                <Images size={28} className="text-zinc-600" />
              </div>
              <p className="text-zinc-400 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm transition-colors"
              >
                Try again
              </button>
            </div>
          ) : activeSmartFolder === 'prompts' ? (
            /* Saved Prompts View */
            <SavedPromptsView searchQuery={searchQuery} />
          ) : filteredGenerations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">

              <div className="w-20 h-20 rounded-2xl bg-zinc-900 shadow-lg flex items-center justify-center mb-6">
                <Images size={32} className="text-zinc-600" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {searchQuery ? 'No matching generations' : activeFolder ? 'Folder is empty' : 'No generations yet'}
              </h3>
              <p className="text-zinc-500 max-w-md">
                {searchQuery
                  ? 'Try a different search term'
                  : activeFolder
                  ? 'Drag generations here to organize them'
                  : 'Start a conversation to generate images. All your creations will appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-5 animate-fadeIn">

              {/* Show folder icons when viewing smart folders (not when inside a user folder) */}
              {!activeFolder && folders.length > 0 && folders.map((folder) => (
                <div key={folder.id} data-item="folder">
                  <FolderIconComponent
                    folder={folder}
                    onOpen={() => handleSelectUserFolder(folder.id)}
                    onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
                    isDragOver={dragState.dropTarget?.id === folder.id && dragState.dropTarget?.type === 'folder'}
                    dropHandlers={dragState.getDropHandlers(
                      { id: folder.id, type: 'folder' },
                      (item) => handleMoveToFolder(item, folder.id)
                    )}
                    isDragging={dragState.isDragging}
                    previewUrls={folderPreviewUrls[folder.id] || []}
                  />
                </div>
              ))}

              {/* Generation items */}
              {filteredGenerations.map((gen) => (
                <div key={gen.id} data-item="generation">
                  <GenerationItem
                    generation={gen}
                    onClick={() => setSelectedGeneration({ gen, imageIdx: 0 })}
                    onContextMenu={(e) => handleContextMenu(e, 'generation', gen)}
                    dragHandlers={dragState.getDragHandlers(
                      {
                        id: gen.id,
                        type: 'generation',
                        sourceFolderId: gen.folder_id || null,
                      },
                      gen.output_urls?.[0]
                    )}
                  />
                </div>
              ))}
            </div>
          )}
          </div>
        </PullToRefresh>
      </div>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={() => setContextMenu({ ...contextMenu, isOpen: false })}
        items={getContextMenuItems()}
      />

      {/* Dialogs */}
      <NewFolderDialog
        isOpen={showNewFolderDialog}
        onClose={() => setShowNewFolderDialog(false)}
        onCreate={async (name, folderType) => {
          const folder = await createFolder(name, undefined, undefined, folderType)
          if (folder) {
            toast.success(`Created "${name}"`)
          } else {
            toast.error('Failed to create folder')
          }
        }}
      />

      <RenameFolderDialog
        isOpen={renameFolderDialog.isOpen}
        folder={renameFolderDialog.folder}
        onClose={() => setRenameFolderDialog({ isOpen: false, folder: null })}
        onRename={async (id, name) => {
          const success = await renameFolder(id, name)
          if (success) {
            toast.success(`Renamed to "${name}"`)
          } else {
            toast.error('Failed to rename folder')
          }
        }}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        danger={confirmDialog.danger}
      />

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedGeneration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
            onClick={() => setSelectedGeneration(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.3}
              onDragEnd={(event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
                // Swipe down to dismiss
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  setSelectedGeneration(null)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10 touch-pan-x"
            >
              {/* Drag handle indicator - mobile only */}
              <div className="md:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-600 rounded-full z-20" />

              {/* Header controls */}
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                {/* Position indicator */}
                {positionInfo && (
                  <span className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-sm text-zinc-300 font-medium tabular-nums">
                    {positionInfo.current} of {positionInfo.total}
                  </span>
                )}
                {/* Close button */}
                <button
                  onClick={() => setSelectedGeneration(null)}
                  className="p-2 rounded-lg bg-black/50 backdrop-blur-sm text-white hover:bg-black/80 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Navigation arrows */}
              <button
                onClick={(e) => { e.stopPropagation(); navigatePrevious() }}
                disabled={!canNavigatePrevious}
                className={cn(
                  "absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 backdrop-blur-sm transition-all",
                  canNavigatePrevious
                    ? "text-white hover:bg-black/80 hover:scale-110"
                    : "text-zinc-600 cursor-not-allowed opacity-50"
                )}
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigateNext() }}
                disabled={!canNavigateNext}
                className={cn(
                  "absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 backdrop-blur-sm transition-all",
                  canNavigateNext
                    ? "text-white hover:bg-black/80 hover:scale-110"
                    : "text-zinc-600 cursor-not-allowed opacity-50"
                )}
              >
                <ChevronRight size={24} />
              </button>

              {/* Image or Video */}
              <div className="relative aspect-video max-h-[70vh] bg-zinc-900 flex items-center justify-center">
                {(() => {
                  const currentUrl = selectedGeneration.gen.output_urls[selectedGeneration.imageIdx]
                  const isVideo = isVideoUrl(currentUrl) || isVideoGeneration(selectedGeneration.gen)

                  if (isVideo) {
                    return (
                      <video
                        src={currentUrl}
                        className="w-full h-full object-contain"
                        controls
                        autoPlay
                        loop
                        playsInline
                      />
                    )
                  }

                  return (
                    <img
                      src={currentUrl}
                      alt={selectedGeneration.gen.prompt || 'Generated image'}
                      className="w-full h-full object-contain"
                    />
                  )
                })()}
              </div>

              {/* Details */}
              <div className="p-6 border-t border-white/[0.06]">
                <p className="text-white mb-2">{selectedGeneration.gen.prompt || 'Untitled'}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <span>{selectedGeneration.gen.studio_models?.name || selectedGeneration.gen.model_slug}</span>
                    <span>·</span>
                    <span>{formatDate(selectedGeneration.gen.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(
                        selectedGeneration.gen.output_urls[selectedGeneration.imageIdx],
                        selectedGeneration.gen.prompt
                      )}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-skinny-yellow text-black font-medium hover:bg-skinny-green transition-colors"
                    >
                      <Download size={16} />
                      Download
                    </button>
                    <a
                      href={selectedGeneration.gen.output_urls[selectedGeneration.imageIdx]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink size={18} />
                    </a>
                  </div>
                </div>

                {/* Multiple images/videos navigation */}
                {selectedGeneration.gen.output_urls.length > 1 && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                    {selectedGeneration.gen.output_urls.map((url, idx) => {
                      const thumbIsVideo = isVideoUrl(url) || isVideoGeneration(selectedGeneration.gen)
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedGeneration({ ...selectedGeneration, imageIdx: idx })}
                          className={cn(
                            "relative w-12 h-12 rounded-lg overflow-hidden transition-all",
                            idx === selectedGeneration.imageIdx
                              ? "ring-2 ring-skinny-yellow"
                              : "ring-1 ring-white/10 hover:ring-white/30"
                          )}
                        >
                          {thumbIsVideo ? (
                            <>
                              <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Video size={12} className="text-white" />
                              </div>
                            </>
                          ) : (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
