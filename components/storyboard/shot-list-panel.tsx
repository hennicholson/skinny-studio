'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Plus, GripVertical, Image, Video, Check, Clock, AlertCircle, Sparkles, Trash2, Edit2, Loader2 } from 'lucide-react'
import { StoryboardShot, StoryboardEntity, ShotEntityReference } from '@/lib/types'
import { EntityTypeBadge } from './entity-type-badge'
import { ShotListSkeleton } from './storyboard-skeleton'

interface ShotListPanelProps {
  shots: StoryboardShot[]
  entities: StoryboardEntity[]
  onAddShot: () => void
  onEditShot: (shot: StoryboardShot) => void
  onDeleteShot: (shotId: string) => void
  onReorderShots: (orderedIds: string[]) => void
  onGenerateShot: (shotId: string) => void
  selectedShotId?: string
  onSelectShot: (shotId: string) => void
  isLoading?: boolean
}

interface ShotListItemProps {
  shot: StoryboardShot
  entities: StoryboardEntity[]
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onGenerate: () => void
}

function ShotListItem({
  shot,
  entities,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onGenerate,
}: ShotListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Get entities associated with this shot from the populated entity references
  const shotEntities = shot.entities
    ?.map(ref => ref.entity)
    .filter((e): e is StoryboardEntity => e !== undefined) || []

  const getStatusIcon = () => {
    switch (shot.status) {
      case 'completed':
        return <Check size={12} className="text-green-400" />
      case 'generating':
        return <Clock size={12} className="text-skinny-yellow animate-pulse" />
      case 'error':
        return <AlertCircle size={12} className="text-red-400" />
      default:
        return <div className="w-3 h-3 rounded-full border border-zinc-600" />
    }
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "group relative rounded-lg border transition-all",
        isDragging
          ? "bg-zinc-800 border-skinny-yellow/50 shadow-lg shadow-skinny-yellow/10 z-50"
          : isSelected
          ? "bg-zinc-800/70 border-skinny-yellow/30"
          : "bg-zinc-800/30 border-zinc-700/50 hover:border-zinc-600"
      )}
    >
      <div
        className="flex items-start gap-2 p-3 cursor-pointer"
        onClick={onSelect}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-700/50 transition-colors cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </button>

        {/* Status & Number */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {getStatusIcon()}
          <span className="text-xs font-mono text-zinc-500">
            {String(shot.shotNumber).padStart(2, '0')}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title if present */}
          {shot.title && (
            <div className="text-sm font-medium text-white mb-1 truncate">
              {shot.title}
            </div>
          )}

          {/* Description */}
          <p className="text-xs text-zinc-400 line-clamp-2">
            {shot.description || 'No description'}
          </p>

          {/* Entity badges */}
          {shotEntities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {shotEntities.slice(0, 3).map(entity => (
                <EntityTypeBadge
                  key={entity.id}
                  type={entity.entityType}
                  name={entity.entityName}
                  size="sm"
                />
              ))}
              {shotEntities.length > 3 && (
                <span className="text-[10px] text-zinc-500 self-center ml-1">
                  +{shotEntities.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Media Type Icon */}
        <div className="flex-shrink-0">
          {shot.mediaType === 'video' ? (
            <Video size={14} className="text-zinc-500" />
          ) : (
            <Image size={14} className="text-zinc-500" />
          )}
        </div>
      </div>

      {/* Action buttons - show on hover or when selected */}
      <div
        className={cn(
          "absolute right-2 top-2 flex items-center gap-1 transition-opacity",
          isSelected || isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {shot.status === 'pending' && (
          <button
            onClick={onGenerate}
            className="p-1.5 rounded-md bg-skinny-yellow/10 text-skinny-yellow hover:bg-skinny-yellow/20 transition-colors"
            title="Generate"
          >
            <Sparkles size={12} />
          </button>
        )}
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md bg-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          title="Edit"
        >
          <Edit2 size={12} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md bg-zinc-700/50 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Generated thumbnail preview */}
      {shot.generationId && shot.status === 'completed' && (
        <div className="absolute -right-1 -bottom-1 w-10 h-10 rounded-md overflow-hidden border border-zinc-700 shadow-lg">
          <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
            <Check size={12} className="text-green-400" />
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function ShotListPanel({
  shots,
  entities,
  onAddShot,
  onEditShot,
  onDeleteShot,
  onReorderShots,
  onGenerateShot,
  selectedShotId,
  onSelectShot,
  isLoading,
}: ShotListPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = shots.findIndex((s) => s.id === active.id)
      const newIndex = shots.findIndex((s) => s.id === over.id)

      const newOrder = arrayMove(shots, oldIndex, newIndex)
      const orderedIds = newOrder.map(s => s.id)
      onReorderShots(orderedIds)
    }
  }, [shots, onReorderShots])

  const sortedShots = [...shots].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Shots</h3>
          <button
            onClick={onAddShot}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-skinny-yellow/10 text-skinny-yellow hover:bg-skinny-yellow/20 transition-colors text-xs font-medium disabled:opacity-50"
          >
            <Plus size={12} />
            Add
          </button>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
          <span>{shots.length} total</span>
          <span className="text-zinc-700">|</span>
          <span className="text-green-400">
            {shots.filter(s => s.status === 'completed').length} done
          </span>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-400">
            {shots.filter(s => s.status === 'pending').length} pending
          </span>
        </div>
      </div>

      {/* Shot List */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <ShotListSkeleton />
        ) : sortedShots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
              <Image size={20} className="text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-500 mb-1">No shots yet</p>
            <p className="text-xs text-zinc-600 mb-4">
              Chat with AI to plan your shots or add them manually
            </p>
            <button
              onClick={onAddShot}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-skinny-yellow text-black font-medium text-sm hover:bg-skinny-green transition-colors"
            >
              <Plus size={14} />
              Add First Shot
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedShots.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <AnimatePresence mode="popLayout">
                <div className="space-y-2">
                  {sortedShots.map((shot) => (
                    <ShotListItem
                      key={shot.id}
                      shot={shot}
                      entities={entities}
                      isSelected={shot.id === selectedShotId}
                      onSelect={() => onSelectShot(shot.id)}
                      onEdit={() => onEditShot(shot)}
                      onDelete={() => onDeleteShot(shot.id)}
                      onGenerate={() => onGenerateShot(shot.id)}
                    />
                  ))}
                </div>
              </AnimatePresence>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Quick Actions Footer */}
      {sortedShots.length > 0 && (
        <div className="flex-shrink-0 p-3 border-t border-zinc-800">
          <button
            onClick={() => {
              // Generate all pending shots
              const pendingShots = shots.filter(s => s.status === 'pending')
              pendingShots.forEach(s => onGenerateShot(s.id))
            }}
            disabled={!shots.some(s => s.status === 'pending') || isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={14} className="text-skinny-yellow" />
            Generate All Pending
          </button>
        </div>
      )}
    </div>
  )
}
