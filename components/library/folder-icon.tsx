'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { User, Globe, Box, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Folder, FolderType } from '@/lib/context/folder-context'

// Entity type badge config
const ENTITY_TYPE_CONFIG: Record<Exclude<FolderType, 'general'>, { icon: typeof User; color: string; bgColor: string }> = {
  character: { icon: User, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  world: { icon: Globe, color: 'text-green-400', bgColor: 'bg-green-500/20' },
  object: { icon: Box, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  style: { icon: Palette, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
}

interface FolderIconProps {
  folder: Folder
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  isDragOver: boolean
  dropHandlers: {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  isDragging: boolean
  previewUrls?: string[]
}

export function FolderIconComponent({
  folder,
  onOpen,
  onContextMenu,
  isDragOver,
  dropHandlers,
  isDragging,
  previewUrls = [],
}: FolderIconProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [cardPosition, setCardPosition] = useState<{ x: number; y: number } | null>(null)
  const folderRef = useRef<HTMLButtonElement>(null)
  const hasContent = previewUrls.length > 0

  // Card fan-out configuration
  const rotations = [-12, 0, 12]
  const translations = [-55, 0, 55]

  // Update card position when hovered
  useEffect(() => {
    if (isHovered && folderRef.current) {
      const rect = folderRef.current.getBoundingClientRect()
      setCardPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2 - 40, // Offset upward from center
      })
    }
  }, [isHovered])

  return (
    <>
      <motion.button
        ref={folderRef}
        onClick={onOpen}
        onDoubleClick={onOpen}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...dropHandlers}
        className={cn(
          "group relative flex flex-col items-center justify-center",
          "p-6 rounded-2xl cursor-pointer w-full aspect-square",
          "bg-zinc-900/60 border border-white/[0.06]",
          "transition-all duration-500 ease-out",
          "hover:shadow-2xl hover:shadow-skinny-yellow/10",
          "hover:border-skinny-yellow/20",
          isDragOver && "shadow-[0_16px_50px_rgba(234,179,8,0.35)] ring-2 ring-skinny-yellow/60 border-skinny-yellow/40",
          isDragging && !isDragOver && "hover:ring-2 hover:ring-skinny-yellow/30"
        )}
        animate={{
          scale: isDragOver ? 1.03 : 1,
          y: isDragOver ? -6 : 0,
        }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 26 }}
        style={{ perspective: "1000px" }}
      >
        {/* Subtle background glow on hover */}
        <div
          className="absolute inset-0 rounded-2xl transition-opacity duration-500 pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 70%, var(--skinny-yellow) 0%, transparent 70%)",
            opacity: isHovered ? 0.08 : 0,
          }}
        />

        {/* Main folder container */}
        <div
          className="relative flex items-center justify-center mb-4"
          style={{ height: "140px", width: "160px" }}
        >
          {/* ===== FOLDER BACK (with tab) - z:10 ===== */}
          <div
            className="absolute w-28 h-20 rounded-lg"
            style={{
              background: isDragOver
                ? "linear-gradient(135deg, #D6FC51 0%, #A8C940 100%)"
                : "linear-gradient(135deg, #8B7500 0%, #6B5A00 100%)",
              transformOrigin: "bottom center",
              transform: isHovered ? "rotateX(-15deg)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), background 300ms ease",
              zIndex: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          />

          {/* Folder tab - z:10 */}
          <div
            className="absolute w-10 h-3 rounded-t-md"
            style={{
              background: isDragOver ? "#c9e645" : "#7A6800",
              top: "calc(50% - 40px - 10px)",
              left: "calc(50% - 56px + 12px)",
              transformOrigin: "bottom center",
              transform: isHovered ? "rotateX(-25deg) translateY(-2px)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), background 300ms ease",
              zIndex: 10,
            }}
          />

          {/* ===== FOLDER FRONT - z:30 ===== */}
          <div
            className="absolute w-28 h-20 rounded-lg"
            style={{
              background: isDragOver
                ? "linear-gradient(135deg, #B8FF00 0%, #9fcc4a 100%)"
                : "linear-gradient(135deg, #D6FC51 0%, #A8C940 100%)",
              top: "calc(50% - 40px + 4px)",
              transformOrigin: "bottom center",
              transform: isHovered ? "rotateX(25deg) translateY(8px)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), background 300ms ease",
              zIndex: 30,
              boxShadow: isDragOver
                ? "0 8px 24px rgba(214, 252, 81, 0.3)"
                : "0 6px 16px rgba(0,0,0,0.25)",
            }}
          />

          {/* Folder front shine effect - z:31 */}
          <div
            className="absolute w-28 h-20 rounded-lg overflow-hidden pointer-events-none"
            style={{
              top: "calc(50% - 40px + 4px)",
              background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 50%)",
              transformOrigin: "bottom center",
              transform: isHovered ? "rotateX(25deg) translateY(8px)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              zIndex: 31,
            }}
          />
        </div>

        {/* Entity type badge - only for non-general folders */}
        {folder.folder_type && folder.folder_type !== 'general' && ENTITY_TYPE_CONFIG[folder.folder_type] && (
          <div
            className={cn(
              "absolute top-3 right-3 p-1.5 rounded-full transition-all duration-300",
              ENTITY_TYPE_CONFIG[folder.folder_type].bgColor
            )}
            style={{
              opacity: isHovered ? 1 : 0.7,
            }}
          >
            {(() => {
              const Icon = ENTITY_TYPE_CONFIG[folder.folder_type].icon
              return <Icon size={14} className={ENTITY_TYPE_CONFIG[folder.folder_type].color} />
            })()}
          </div>
        )}

        {/* Folder title */}
        <h3
          className={cn(
            "text-sm font-semibold transition-all duration-300 truncate max-w-full px-2 text-center",
            isDragOver ? "text-skinny-yellow" : "text-white"
          )}
          style={{
            transform: isHovered ? "translateY(4px)" : "translateY(0)",
          }}
        >
          {folder.name}
        </h3>

        {/* Item count */}
        <p
          className={cn(
            "text-xs transition-all duration-300",
            isDragOver ? "text-skinny-yellow/70" : "text-zinc-500"
          )}
          style={{
            opacity: isHovered ? 0.7 : 1,
          }}
        >
          {folder.generation_count === 0
            ? 'Empty'
            : `${folder.generation_count} item${folder.generation_count !== 1 ? 's' : ''}`
          }
        </p>

        {/* Hover hint - fades out on hover */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[10px] text-zinc-600 transition-all duration-300"
          style={{
            opacity: isHovered ? 0 : 0.6,
            transform: isHovered ? "translateY(10px)" : "translateY(0)",
          }}
        >
          <span>Hover to explore</span>
        </div>

        {/* Drop state glow overlay */}
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 rounded-2xl pointer-events-none bg-gradient-to-b from-skinny-yellow/10 via-transparent to-skinny-green/10"
          />
        )}
      </motion.button>

      {/* ===== PREVIEW CARDS - Rendered via Portal with fixed positioning ===== */}
      {typeof window !== 'undefined' && hasContent && cardPosition && createPortal(
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            left: cardPosition.x,
            top: cardPosition.y,
            zIndex: 9999,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {previewUrls.slice(0, 3).map((url, index) => (
            <div
              key={index}
              className={cn(
                "absolute w-16 h-24 rounded-lg overflow-hidden",
                "bg-zinc-800 border border-white/20",
              )}
              style={{
                transform: isHovered
                  ? `translateY(-45px) translateX(${translations[index]}px) rotate(${rotations[index]}deg) scale(1)`
                  : "translateY(40px) translateX(0px) rotate(0deg) scale(0.3)",
                opacity: isHovered ? 1 : 0,
                transition: `all 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 80}ms`,
                left: "-32px",
                top: "-48px",
                boxShadow: isHovered ? "0 12px 40px rgba(0,0,0,0.6)" : "none",
              }}
            >
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
