'use client'

import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Folder as FolderIcon, Plus, Monitor, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Folder } from '@/lib/context/folder-context'
import { DragItem } from '@/lib/hooks/use-drag-state'

interface FolderTabsBarProps {
  folders: Folder[]
  activeFolder: string | null  // null = Desktop
  unfiledCount: number
  onSelectFolder: (folderId: string | null) => void
  onNewFolder: () => void
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

export function FolderTabsBar({
  folders,
  activeFolder,
  unfiledCount,
  onSelectFolder,
  onNewFolder,
  isDragging,
  dropTarget,
  getDropHandlers,
  onMoveToFolder,
}: FolderTabsBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex-shrink-0 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50">
      <div className="flex items-center px-3 py-2 gap-1.5 overflow-x-auto scrollbar-hide" ref={scrollRef}>
        {/* Desktop Tab */}
        <TabButton
          isActive={activeFolder === null}
          onClick={() => onSelectFolder(null)}
          isDragOver={isDragging && dropTarget?.id === null && dropTarget?.type === 'tab'}
          dropHandlers={getDropHandlers(
            { id: null, type: 'tab' },
            (item) => onMoveToFolder(item, null)
          )}
          isDragging={isDragging}
          icon={<Monitor size={13} />}
          count={unfiledCount}
        >
          Desktop
        </TabButton>

        {/* Divider */}
        {folders.length > 0 && (
          <div className="w-px h-5 bg-zinc-700/50 mx-1" />
        )}

        {/* Folder Tabs */}
        {folders.map((folder) => (
          <TabButton
            key={folder.id}
            isActive={activeFolder === folder.id}
            onClick={() => onSelectFolder(folder.id)}
            isDragOver={isDragging && dropTarget?.id === folder.id && dropTarget?.type === 'tab'}
            dropHandlers={getDropHandlers(
              { id: folder.id, type: 'tab' },
              (item) => onMoveToFolder(item, folder.id)
            )}
            isDragging={isDragging}
            icon={<FolderIcon size={13} />}
            count={folder.generation_count}
          >
            {folder.name}
          </TabButton>
        ))}

        {/* New Folder Button */}
        <motion.button
          onClick={onNewFolder}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-skinny-yellow hover:bg-skinny-yellow/10 transition-all"
        >
          <Plus size={15} strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  )
}

interface TabButtonProps {
  children: React.ReactNode
  isActive: boolean
  onClick: () => void
  isDragOver: boolean
  dropHandlers: {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  isDragging: boolean
  icon: React.ReactNode
  count?: number
}

function TabButton({
  children,
  isActive,
  onClick,
  isDragOver,
  dropHandlers,
  isDragging,
  icon,
  count,
}: TabButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      {...dropHandlers}
      className={cn(
        "relative flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
        isActive
          ? "bg-gradient-to-b from-skinny-yellow to-skinny-green text-black shadow-lg shadow-skinny-yellow/20"
          : "text-zinc-400 hover:text-white hover:bg-white/5",
        // Drop target styling
        isDragOver && !isActive && "ring-2 ring-skinny-yellow bg-skinny-yellow/20 text-white",
        isDragging && !isActive && "hover:ring-1 hover:ring-skinny-yellow/50"
      )}
      animate={{
        scale: isDragOver ? 1.05 : 1,
      }}
      transition={{ duration: 0.15 }}
    >
      <span className={cn(
        "transition-colors",
        isActive ? "text-black" : isDragOver ? "text-skinny-yellow" : "text-zinc-500"
      )}>
        {icon}
      </span>
      <span>{children}</span>
      {count !== undefined && count > 0 && (
        <span className={cn(
          "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
          isActive
            ? "bg-black/20 text-black"
            : "bg-zinc-800 text-zinc-400"
        )}>
          {count}
        </span>
      )}
    </motion.button>
  )
}
