'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SidebarItemProps {
  icon: ReactNode
  label: string
  count?: number
  isActive: boolean
  onClick: () => void
  isDragOver?: boolean
  dropHandlers?: {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  onContextMenu?: (e: React.MouseEvent) => void
}

export function SidebarItem({
  icon,
  label,
  count,
  isActive,
  onClick,
  isDragOver,
  dropHandlers,
  onContextMenu,
}: SidebarItemProps) {
  return (
    <motion.button
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...dropHandlers}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200",
        "relative group",
        isActive
          ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
        isDragOver && !isActive && "bg-skinny-yellow/[0.08] ring-1 ring-skinny-yellow/40 text-skinny-yellow"
      )}
      whileHover={{ x: isActive ? 0 : 2 }}
      animate={{
        scale: isDragOver ? 1.01 : 1,
      }}
      transition={{ duration: 0.15 }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-skinny-yellow to-skinny-green rounded-full shadow-[0_0_8px_rgba(234,179,8,0.4)]"
          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        />
      )}

      {/* Icon */}
      <span className={cn(
        "w-5 h-5 flex items-center justify-center transition-colors",
        isActive ? "text-skinny-yellow" : "text-zinc-500 group-hover:text-zinc-400",
        isDragOver && "text-skinny-yellow"
      )}>
        {icon}
      </span>

      {/* Label */}
      <span className="flex-1 text-left truncate">{label}</span>

      {/* Count badge */}
      {count !== undefined && count > 0 && (
        <span className={cn(
          "text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md",
          isActive ? "text-zinc-300 bg-white/[0.06]" : "text-zinc-600"
        )}>
          {count}
        </span>
      )}
    </motion.button>
  )
}
