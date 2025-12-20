'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Plus, Search, User, Globe, Box, Palette, Trash2, Eye, Sparkles, MoreVertical, RefreshCw } from 'lucide-react'
import { StoryboardEntity, EntityType } from '@/lib/types'
import { EntityTypeBadge, getEntityTypeColor, getEntityTypeBgColor, getEntityTypeIcon, getEntityTypeLabel } from './entity-type-badge'
import { EntityPanelSkeleton } from './storyboard-skeleton'
import { glassClasses } from '@/lib/liquid-glass-styles'

interface EntityPanelProps {
  entities: StoryboardEntity[]
  onAddEntity: () => void
  onEditEntity: (entity: StoryboardEntity) => void
  onDeleteEntity: (entityId: string) => void
  onAnalyzeEntity: (entityId: string) => void
  onViewEntity: (entity: StoryboardEntity) => void
  selectedEntityId?: string
  onSelectEntity: (entityId: string) => void
  isLoading?: boolean
}

interface EntityCardProps {
  entity: StoryboardEntity
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onAnalyze: () => void
  onView: () => void
  isAnalyzing?: boolean
}

const ENTITY_TYPE_ORDER: EntityType[] = ['character', 'world', 'object', 'style']

function EntityCard({
  entity,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onAnalyze,
  onView,
  isAnalyzing,
}: EntityCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const Icon = getEntityTypeIcon(entity.entityType)
  const color = getEntityTypeColor(entity.entityType)
  const bgColor = getEntityTypeBgColor(entity.entityType)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "group relative rounded-xl border backdrop-blur-sm transition-all duration-300 overflow-hidden",
        isSelected
          ? "border-skinny-yellow/30 bg-skinny-yellow/5 shadow-lg shadow-skinny-yellow/10"
          : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
      )}
    >
      <div
        className="flex items-start gap-3 p-2 cursor-pointer"
        onClick={onSelect}
      >
        {/* Entity Image */}
        <div className={cn("relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0", bgColor)}>
          {entity.primaryImageUrl ? (
            <img
              src={entity.primaryImageUrl}
              alt={entity.entityName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon size={24} className={color} />
            </div>
          )}

          {/* Analyzing indicator */}
          {isAnalyzing && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <RefreshCw size={14} className="text-skinny-yellow animate-spin" />
            </div>
          )}
        </div>

        {/* Entity Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white truncate">
              {entity.entityName}
            </span>
            <EntityTypeBadge type={entity.entityType} size="sm" />
          </div>

          {/* Vision context preview */}
          {entity.visionContext ? (
            <p className="text-[10px] text-zinc-500 line-clamp-2 mt-1">
              {entity.visionContext}
            </p>
          ) : (
            <p className="text-[10px] text-zinc-600 italic mt-1">
              No vision context yet
            </p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-zinc-700/50 transition-colors"
          >
            <MoreVertical size={14} />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-full mt-1 w-36 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onView()
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    <Eye size={12} />
                    View Details
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onAnalyze()
                      setShowMenu(false)
                    }}
                    disabled={isAnalyzing}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-skinny-yellow hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  >
                    <Sparkles size={12} />
                    {isAnalyzing ? 'Analyzing...' : 'Analyze Image'}
                  </button>
                  <div className="h-px bg-zinc-700 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete()
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Vision context badge if analyzed */}
      {entity.visionContext && (
        <div className="absolute top-1 right-8 p-0.5 rounded-full bg-green-500/20">
          <Sparkles size={8} className="text-green-400" />
        </div>
      )}
    </motion.div>
  )
}

export function EntityPanel({
  entities,
  onAddEntity,
  onEditEntity,
  onDeleteEntity,
  onAnalyzeEntity,
  onViewEntity,
  selectedEntityId,
  onSelectEntity,
  isLoading,
}: EntityPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<EntityType | 'all'>('all')
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())

  // Filter entities
  const filteredEntities = entities.filter(entity => {
    const matchesSearch = entity.entityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          entity.entityDescription?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === 'all' || entity.entityType === typeFilter
    return matchesSearch && matchesType
  })

  // Group by type
  const groupedEntities = ENTITY_TYPE_ORDER.reduce((acc, type) => {
    const typeEntities = filteredEntities.filter(e => e.entityType === type)
    if (typeEntities.length > 0) {
      acc[type] = typeEntities
    }
    return acc
  }, {} as Record<EntityType, StoryboardEntity[]>)

  const handleAnalyze = async (entityId: string) => {
    setAnalyzingIds(prev => new Set(prev).add(entityId))
    try {
      await onAnalyzeEntity(entityId)
    } finally {
      setAnalyzingIds(prev => {
        const next = new Set(prev)
        next.delete(entityId)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header - simplified since parent shows title */}
      <div className="flex-shrink-0 px-3 pt-1 pb-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onAddEntity}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-300",
              "bg-gradient-to-br from-skinny-yellow/90 to-skinny-yellow/70 text-black",
              "shadow-md shadow-skinny-yellow/20 hover:shadow-skinny-yellow/40",
              "hover:scale-105 active:scale-95 disabled:opacity-50"
            )}
          >
            <Plus size={12} />
            Add Entity
          </button>
        </div>

        {/* Search */}
        {entities.length > 0 && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entities..."
              className={cn(
                "w-full pl-8 pr-3 py-1.5 text-xs rounded-xl transition-all duration-300",
                "bg-white/[0.03] border border-white/10 text-white placeholder-zinc-500",
                "focus:outline-none focus:border-skinny-yellow/30 focus:bg-white/[0.05]"
              )}
            />
          </div>
        )}
      </div>

      {/* Type Filter Tabs */}
      {entities.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 border-b border-zinc-800/50 overflow-x-auto">
          <div className="flex gap-1">
            <button
              onClick={() => setTypeFilter('all')}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0",
                typeFilter === 'all'
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              All ({entities.length})
            </button>
            {ENTITY_TYPE_ORDER.map(type => {
              const count = entities.filter(e => e.entityType === type).length
              if (count === 0) return null
              const Icon = getEntityTypeIcon(type)
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0",
                    typeFilter === type
                      ? getEntityTypeBgColor(type) + " " + getEntityTypeColor(type)
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <Icon size={10} />
                  {count}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Entity List */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <EntityPanelSkeleton />
        ) : entities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
              <User size={16} className="text-zinc-600" />
            </div>
            <p className="text-xs text-zinc-500 mb-1">No entities yet</p>
            <p className="text-[10px] text-zinc-600 mb-3">
              Add characters, worlds, objects, and styles
            </p>
            <button
              onClick={onAddEntity}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-skinny-yellow text-black font-medium text-xs hover:bg-skinny-green transition-colors"
            >
              <Plus size={12} />
              Add Entity
            </button>
          </div>
        ) : filteredEntities.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-zinc-500">No entities match your search</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Grouped Display */}
            {Object.entries(groupedEntities).map(([type, typeEntities]) => {
              const Icon = getEntityTypeIcon(type as EntityType)
              return (
                <div key={type}>
                  {/* Type Header */}
                  {typeFilter === 'all' && (
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={12} className={getEntityTypeColor(type as EntityType)} />
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                        {getEntityTypeLabel(type as EntityType)}s
                      </span>
                      <span className="text-[10px] text-zinc-600">({typeEntities.length})</span>
                    </div>
                  )}

                  {/* Entity Cards */}
                  <AnimatePresence mode="popLayout">
                    <div className="space-y-2">
                      {typeEntities.map(entity => (
                        <EntityCard
                          key={entity.id}
                          entity={entity}
                          isSelected={entity.id === selectedEntityId}
                          onSelect={() => onSelectEntity(entity.id)}
                          onEdit={() => onEditEntity(entity)}
                          onDelete={() => onDeleteEntity(entity.id)}
                          onAnalyze={() => handleAnalyze(entity.id)}
                          onView={() => onViewEntity(entity)}
                          isAnalyzing={analyzingIds.has(entity.id)}
                        />
                      ))}
                    </div>
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {entities.length > 0 && (
        <div className="flex-shrink-0 p-2 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            {ENTITY_TYPE_ORDER.map(type => {
              const count = entities.filter(e => e.entityType === type).length
              if (count === 0) return null
              const Icon = getEntityTypeIcon(type)
              return (
                <div key={type} className="flex items-center gap-1">
                  <Icon size={10} className={getEntityTypeColor(type)} />
                  <span>{count}</span>
                </div>
              )
            })}
          </div>
          <span className="flex items-center gap-1">
            <Sparkles size={10} className="text-green-400" />
            {entities.filter(e => e.visionContext).length}/{entities.length}
          </span>
        </div>
      )}
    </div>
  )
}
