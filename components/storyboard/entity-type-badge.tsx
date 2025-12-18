'use client'

import { cn } from '@/lib/utils'
import { User, Globe, Box, Palette } from 'lucide-react'
import { EntityType } from '@/lib/types'

interface EntityTypeBadgeProps {
  type: EntityType
  name?: string
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const TYPE_CONFIG: Record<EntityType, { icon: typeof User; color: string; bgColor: string; label: string }> = {
  character: {
    icon: User,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    label: 'Character',
  },
  world: {
    icon: Globe,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    label: 'World',
  },
  object: {
    icon: Box,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    label: 'Object',
  },
  style: {
    icon: Palette,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    label: 'Style',
  },
}

const SIZE_CONFIG = {
  sm: {
    badge: 'px-1.5 py-0.5 gap-1',
    icon: 10,
    text: 'text-[10px]',
  },
  md: {
    badge: 'px-2 py-1 gap-1.5',
    icon: 12,
    text: 'text-xs',
  },
  lg: {
    badge: 'px-2.5 py-1.5 gap-2',
    icon: 14,
    text: 'text-sm',
  },
}

export function EntityTypeBadge({
  type,
  name,
  size = 'md',
  showLabel = false,
  className,
}: EntityTypeBadgeProps) {
  const config = TYPE_CONFIG[type]
  const sizeConfig = SIZE_CONFIG[size]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md',
        config.bgColor,
        sizeConfig.badge,
        className
      )}
      title={`${config.label}${name ? `: ${name}` : ''}`}
    >
      <Icon size={sizeConfig.icon} className={config.color} />
      {(name || showLabel) && (
        <span className={cn('font-medium truncate max-w-[100px]', config.color, sizeConfig.text)}>
          {name || config.label}
        </span>
      )}
    </div>
  )
}

export function getEntityTypeIcon(type: EntityType) {
  return TYPE_CONFIG[type].icon
}

export function getEntityTypeColor(type: EntityType) {
  return TYPE_CONFIG[type].color
}

export function getEntityTypeBgColor(type: EntityType) {
  return TYPE_CONFIG[type].bgColor
}

export function getEntityTypeLabel(type: EntityType) {
  return TYPE_CONFIG[type].label
}
