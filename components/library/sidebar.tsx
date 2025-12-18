'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutGrid,
  Monitor,
  Clock,
  Image,
  Video,
  Folder,
  Plus,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Folder as FolderType } from '@/lib/context/folder-context'
import { DragItem } from '@/lib/hooks/use-drag-state'
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  SidebarSection,
  SidebarLogo,
  useSidebar,
} from '@/components/ui/sidebar'

// Smart folder types
export type SmartFolder = 'all' | 'desktop' | 'recents' | 'images' | 'videos'

interface LibrarySidebarProps {
  // Smart folders
  activeSmartFolder: SmartFolder | null
  onSelectSmartFolder: (folder: SmartFolder) => void
  smartFolderCounts: {
    all: number
    desktop: number
    recents: number
    images: number
    videos: number
  }

  // User folders
  folders: FolderType[]
  activeFolder: string | null
  onSelectFolder: (folderId: string) => void
  onNewFolder: () => void
  onFolderContextMenu: (e: React.MouseEvent, folder: FolderType) => void

  // Drag and drop
  isDragging: boolean
  dropTarget: { id: string | null; type: string } | null
  getDropHandlers: (
    target: { id: string | null; type: 'folder' | 'tab' | 'desktop' },
    onDrop: (item: DragItem) => void
  ) => {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  onMoveToFolder: (item: DragItem, folderId: string | null) => void
}

const smartFolders: { id: SmartFolder; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'all', label: 'All Items', icon: LayoutGrid },
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'recents', label: 'Recents', icon: Clock },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'videos', label: 'Videos', icon: Video },
]

// Inner component that uses the sidebar context
function LibrarySidebarContent({
  activeSmartFolder,
  onSelectSmartFolder,
  smartFolderCounts,
  folders,
  activeFolder,
  onSelectFolder,
  onNewFolder,
  onFolderContextMenu,
  isDragging,
  dropTarget,
  getDropHandlers,
  onMoveToFolder,
}: LibrarySidebarProps) {
  const { open } = useSidebar()

  return (
    <SidebarBody className="justify-between gap-6">
      <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {/* Logo */}
        <SidebarLogo
          icon={
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center shadow-lg shadow-skinny-yellow/20">
              <Sparkles size={16} className="text-black" />
            </div>
          }
          title="Library"
          subtitle="Your creations"
        />

        {/* Smart Folders */}
        <SidebarSection title="Library">
          {smartFolders.map(({ id, label, icon: Icon }) => (
            <SidebarLink
              key={id}
              link={{
                label,
                icon: <Icon size={18} strokeWidth={1.8} />,
                onClick: () => onSelectSmartFolder(id),
                isActive: activeSmartFolder === id && activeFolder === null,
                badge: smartFolderCounts[id],
              }}
            />
          ))}
        </SidebarSection>

        {/* User Folders */}
        <SidebarSection
          title="Folders"
          action={
            <motion.button
              onClick={onNewFolder}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-5 h-5 flex items-center justify-center rounded-md text-zinc-500 hover:text-skinny-yellow hover:bg-white/[0.04] transition-all duration-200"
            >
              <Plus size={14} strokeWidth={2.5} />
            </motion.button>
          }
        >
          {folders.length === 0 ? (
            open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-3 py-4 text-center"
              >
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-zinc-800/50 flex items-center justify-center">
                  <Folder size={18} className="text-zinc-600" />
                </div>
                <p className="text-[12px] text-zinc-600">No folders yet</p>
                <p className="text-[11px] text-zinc-700 mt-1">Click + to create</p>
              </motion.div>
            )
          ) : (
            folders.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                isActive={activeFolder === folder.id}
                onSelect={() => onSelectFolder(folder.id)}
                onContextMenu={(e) => onFolderContextMenu(e, folder)}
                isDragOver={isDragging && dropTarget?.id === folder.id}
                dropHandlers={getDropHandlers(
                  { id: folder.id, type: 'folder' },
                  (item) => onMoveToFolder(item, folder.id)
                )}
              />
            ))
          )}
        </SidebarSection>
      </div>
    </SidebarBody>
  )
}

// Folder item with simple icon and drop zone support
function FolderItem({
  folder,
  isActive,
  onSelect,
  onContextMenu,
  isDragOver,
  dropHandlers,
}: {
  folder: FolderType
  isActive: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  isDragOver: boolean
  dropHandlers: {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
}) {
  const { open, animate } = useSidebar()

  return (
    <motion.button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...dropHandlers}
      className={cn(
        "relative flex items-center gap-3 group/sidebar py-2.5 px-3 rounded-xl transition-all duration-200 w-full text-left",
        "hover:bg-white/[0.04]",
        isActive && "bg-white/[0.06]",
        isDragOver && "bg-skinny-yellow/[0.08] ring-1 ring-skinny-yellow/40"
      )}
      animate={{ scale: isDragOver ? 1.02 : 1 }}
      transition={{ duration: 0.15 }}
    >
      {/* Simple folder icon */}
      <div className={cn(
        "flex items-center justify-center shrink-0 w-5 h-5",
        "rounded-md bg-gradient-to-br from-skinny-yellow to-skinny-green",
        "shadow-sm transition-transform duration-200",
        isDragOver && "scale-110"
      )}>
        <Folder size={11} className="text-black" fill="currentColor" />
      </div>

      {/* Label */}
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.2, delay: open ? 0.1 : 0 }}
        className={cn(
          "text-[13px] font-medium whitespace-pre inline-block transition-all duration-200",
          "group-hover/sidebar:translate-x-0.5 truncate flex-1",
          isActive ? "text-white" : "text-zinc-400 group-hover/sidebar:text-zinc-200",
          isDragOver && "text-skinny-yellow"
        )}
      >
        {folder.name}
      </motion.span>

      {/* Count badge */}
      {folder.generation_count > 0 && open && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md",
            isActive ? "text-zinc-300 bg-white/[0.08]" : "text-zinc-600"
          )}
        >
          {folder.generation_count}
        </motion.span>
      )}

      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="activeFolderIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-skinny-yellow to-skinny-green rounded-full shadow-[0_0_8px_rgba(234,179,8,0.4)]"
          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        />
      )}
    </motion.button>
  )
}

// Main export - wraps content with Sidebar provider
export function LibrarySidebar(props: LibrarySidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <LibrarySidebarContent {...props} />
    </Sidebar>
  )
}

// Keep the old export name for backwards compatibility
export { LibrarySidebar as Sidebar }
