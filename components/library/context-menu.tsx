'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderPlus,
  Download,
  Copy,
  FolderInput,
  Trash2,
  Pencil,
  ChevronRight,
  FileArchive,
  Monitor,
  Share2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Folder } from '@/lib/context/folder-context'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  submenu?: MenuItem[]
}

interface ContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  items: MenuItem[]
}

export function ContextMenu({ isOpen, position, onClose, items }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [submenuOpen, setSubmenuOpen] = useState<string | null>(null)
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [mounted, setMounted] = useState(false)

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Close submenu when main menu closes
  useEffect(() => {
    if (!isOpen) {
      setSubmenuOpen(null)
    }
  }, [isOpen])

  // Adjust position to keep menu in viewport
  const getAdjustedPosition = () => {
    if (typeof window === 'undefined') return position

    const menuWidth = 220
    const menuHeight = items.length * 40 + 16

    let x = position.x
    let y = position.y

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10
    }

    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10
    }

    return { x: Math.max(10, x), y: Math.max(10, y) }
  }

  const handleSubmenuHover = (itemId: string, itemElement: HTMLElement) => {
    const rect = itemElement.getBoundingClientRect()
    setSubmenuPosition({
      x: rect.right + 4,
      y: rect.top,
    })
    setSubmenuOpen(itemId)
  }

  if (!mounted) return null

  const adjustedPosition = getAdjustedPosition()

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -5 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{
            position: 'fixed',
            left: adjustedPosition.x,
            top: adjustedPosition.y,
            zIndex: 9999,
          }}
          className="min-w-[200px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
        >
          <div className="py-1.5">
            {items.map((item, index) => {
              // Separator
              if (item.id === 'separator') {
                return <div key={`sep-${index}`} className="h-px bg-zinc-700/50 my-1.5 mx-2" />
              }

              const hasSubmenu = item.submenu && item.submenu.length > 0

              return (
                <div
                  key={item.id}
                  onMouseEnter={(e) => {
                    if (hasSubmenu) {
                      handleSubmenuHover(item.id, e.currentTarget)
                    } else {
                      setSubmenuOpen(null)
                    }
                  }}
                >
                  <button
                    onClick={() => {
                      if (!hasSubmenu && item.onClick && !item.disabled) {
                        item.onClick()
                        onClose()
                      }
                    }}
                    disabled={item.disabled}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg text-sm transition-all",
                      "w-[calc(100%-12px)]",
                      item.disabled
                        ? "text-zinc-600 cursor-not-allowed"
                        : item.danger
                        ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        : "text-zinc-200 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {item.icon && (
                      <span className={cn(
                        "w-4 h-4 flex items-center justify-center",
                        item.danger ? "text-red-400" : "text-zinc-400"
                      )}>
                        {item.icon}
                      </span>
                    )}
                    <span className="flex-1 text-left font-medium">{item.label}</span>
                    {hasSubmenu && <ChevronRight size={14} className="text-zinc-500" />}
                  </button>

                  {/* Submenu */}
                  <AnimatePresence>
                    {hasSubmenu && submenuOpen === item.id && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="fixed min-w-[180px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
                        style={{
                          left: submenuPosition.x,
                          top: submenuPosition.y,
                          zIndex: 10000,
                        }}
                      >
                        <div className="py-1.5">
                          {item.submenu!.map((subItem) => (
                            <button
                              key={subItem.id}
                              onClick={() => {
                                if (subItem.onClick && !subItem.disabled) {
                                  subItem.onClick()
                                  onClose()
                                }
                              }}
                              disabled={subItem.disabled}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg text-sm transition-all",
                                "w-[calc(100%-12px)]",
                                subItem.disabled
                                  ? "text-zinc-600 cursor-not-allowed"
                                  : subItem.danger
                                  ? "text-red-400 hover:bg-red-500/10"
                                  : "text-zinc-200 hover:bg-white/10 hover:text-white"
                              )}
                            >
                              {subItem.icon && (
                                <span className="w-4 h-4 flex items-center justify-center text-zinc-400">
                                  {subItem.icon}
                                </span>
                              )}
                              <span className="flex-1 text-left font-medium">{subItem.label}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// Helper to build context menu items for different contexts
export function buildDesktopMenuItems(
  onNewFolder: () => void
): MenuItem[] {
  return [
    {
      id: 'new-folder',
      label: 'New Folder',
      icon: <FolderPlus size={15} />,
      onClick: onNewFolder,
    },
  ]
}

export function buildGenerationMenuItems(
  folders: Folder[],
  currentFolderId: string | null,
  handlers: {
    onDownload: () => void,
    onDownloadAll?: () => void,
    onCopyPrompt: () => void,
    onMoveTo: (folderId: string | null) => void,
    onDelete: () => void,
    onShareToGallery?: () => void,
  },
  isMultiImage?: boolean
): MenuItem[] {
  const { onDownload, onDownloadAll, onCopyPrompt, onMoveTo, onDelete, onShareToGallery } = handlers

  const moveToSubmenu: MenuItem[] = [
    // Desktop option (unfiled)
    {
      id: 'move-desktop',
      label: 'Desktop',
      icon: <Monitor size={14} />,
      disabled: currentFolderId === null,
      onClick: () => onMoveTo(null),
    },
    ...(folders.length > 0
      ? [{ id: 'separator', label: '' } as MenuItem]
      : []),
    ...folders.map((folder) => ({
      id: `move-${folder.id}`,
      label: folder.name,
      disabled: folder.id === currentFolderId,
      onClick: () => onMoveTo(folder.id),
    })),
  ]

  const items: MenuItem[] = [
    {
      id: 'download',
      label: 'Download',
      icon: <Download size={15} />,
      onClick: onDownload,
    },
  ]

  if (isMultiImage && onDownloadAll) {
    items.push({
      id: 'download-all',
      label: 'Download All',
      icon: <FileArchive size={15} />,
      onClick: onDownloadAll,
    })
  }

  items.push(
    {
      id: 'copy-prompt',
      label: 'Copy Prompt',
      icon: <Copy size={15} />,
      onClick: onCopyPrompt,
    },
    { id: 'separator', label: '' },
    {
      id: 'move-to',
      label: 'Move To...',
      icon: <FolderInput size={15} />,
      submenu: moveToSubmenu,
    },
  )

  // Add share to gallery option if handler provided
  if (onShareToGallery) {
    items.push({
      id: 'share-to-gallery',
      label: 'Share to Gallery',
      icon: <Share2 size={15} />,
      onClick: onShareToGallery,
    })
  }

  items.push(
    { id: 'separator', label: '' },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 size={15} />,
      onClick: onDelete,
      danger: true,
    }
  )

  return items
}

export function buildFolderMenuItems(
  onRename: () => void,
  onDelete: () => void
): MenuItem[] {
  return [
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil size={15} />,
      onClick: onRename,
    },
    { id: 'separator', label: '' },
    {
      id: 'delete',
      label: 'Delete Folder',
      icon: <Trash2 size={15} />,
      onClick: onDelete,
      danger: true,
    },
  ]
}
