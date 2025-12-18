'use client'

import { useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform, PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import { GalleryItem } from './gallery-card'

interface GalleryDockProps {
  items: GalleryItem[]
  activeIndex: number
  onSelect: (index: number) => void
}

export function GalleryDock({ items, activeIndex, onSelect }: GalleryDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Draggable position
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Mouse position for tilt effect
  const mouseX = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dockRef.current) return
    const rect = dockRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
  }

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false)
    // Snap to edges if near them
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const currentX = x.get()
    const currentY = y.get()

    // Clamp to viewport bounds
    const clampedX = Math.max(-viewportWidth / 2 + 150, Math.min(viewportWidth / 2 - 150, currentX))
    const clampedY = Math.max(-viewportHeight / 2 + 50, Math.min(viewportHeight / 2 - 100, currentY))

    x.set(clampedX)
    y.set(clampedY)
  }

  return (
    <motion.div
      ref={dockRef}
      className={cn(
        'fixed bottom-8 left-1/2 z-[60]',
        'flex items-center gap-1 px-3 py-2',
        'bg-zinc-900/90 backdrop-blur-xl rounded-2xl',
        'border border-white/10 shadow-2xl shadow-black/50',
        isDragging && 'cursor-grabbing'
      )}
      style={{ x, y }}
      drag
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      onMouseMove={handleMouseMove}
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {/* Drag handle indicator */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-white/20" />

      {items.slice(0, 10).map((item, index) => (
        <DockThumbnail
          key={item.id}
          item={item}
          index={index}
          isActive={activeIndex === index}
          onSelect={() => onSelect(index)}
          mouseX={mouseX}
          totalItems={Math.min(items.length, 10)}
        />
      ))}

      {items.length > 10 && (
        <div className="w-12 h-16 flex items-center justify-center text-zinc-500 text-xs">
          +{items.length - 10}
        </div>
      )}
    </motion.div>
  )
}

interface DockThumbnailProps {
  item: GalleryItem
  index: number
  isActive: boolean
  onSelect: () => void
  mouseX: any
  totalItems: number
}

function DockThumbnail({ item, index, isActive, onSelect, mouseX, totalItems }: DockThumbnailProps) {
  const ref = useRef<HTMLButtonElement>(null)

  // Calculate distance from mouse for tilt effect
  const distance = useTransform(mouseX, (val: number) => {
    if (!ref.current) return 0
    const rect = ref.current.getBoundingClientRect()
    const thumbCenter = rect.left + rect.width / 2 - (ref.current.parentElement?.getBoundingClientRect().left || 0)
    return val - thumbCenter
  })

  // Tilt based on distance (-15° to +15°)
  const rotateY = useTransform(distance, [-100, 0, 100], [15, 0, -15])
  const springRotateY = useSpring(rotateY, { stiffness: 400, damping: 30 })

  // Scale up when active or hovered
  const scale = useSpring(isActive ? 1.15 : 1, { stiffness: 400, damping: 25 })

  // Pop up when active
  const yOffset = useSpring(isActive ? -8 : 0, { stiffness: 400, damping: 25 })

  return (
    <motion.button
      ref={ref}
      onClick={onSelect}
      className={cn(
        'relative w-12 h-16 rounded-lg overflow-hidden',
        'transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-skinny-yellow/50',
        isActive && 'ring-2 ring-skinny-yellow'
      )}
      style={{
        rotateY: springRotateY,
        scale,
        y: yOffset,
        transformStyle: 'preserve-3d',
        perspective: '500px',
      }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      <img
        src={item.imageUrl}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Active indicator glow */}
      {isActive && (
        <motion.div
          className="absolute inset-0 bg-skinny-yellow/20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}

      {/* Subtle overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
    </motion.button>
  )
}
