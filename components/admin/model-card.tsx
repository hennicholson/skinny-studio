'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Edit2,
  Trash2,
  MoreVertical,
  Loader2,
  AlertCircle,
  Image,
  Video,
  Type,
  Layers,
  ImagePlus,
  Film,
  Clapperboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParamSpec } from '@/lib/orchestrator/model-specs'
import type { StudioModel, MergedModel } from '@/lib/types/admin'
import { formatCost } from '@/lib/types/admin'

interface ModelCardProps {
  model: MergedModel
  onToggle: (model: StudioModel) => Promise<void>
  onDelete: (model: StudioModel) => Promise<void>
  togglingId: string | null
}

// Capability display config
const CAPABILITY_CONFIG: Record<string, { label: string; icon: typeof Type }> = {
  textRendering: { label: 'Text Rendering', icon: Type },
  multipleReferences: { label: 'Multiple References', icon: Layers },
  supportsReferenceImages: { label: 'Reference Images', icon: ImagePlus },
  supportsStartingFrame: { label: 'Starting Frame', icon: Film },
  supportsLastFrame: { label: 'End Frame', icon: Clapperboard },
  lastFrame: { label: 'End Frame', icon: Clapperboard },
  controlNet: { label: 'ControlNet', icon: Layers },
  inpainting: { label: 'Inpainting', icon: Image },
  outpainting: { label: 'Outpainting', icon: Image },
}

// Parameter type colors
const PARAM_TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-500/20 text-blue-400',
  number: 'bg-purple-500/20 text-purple-400',
  enum: 'bg-yellow-500/20 text-yellow-400',
  boolean: 'bg-green-500/20 text-green-400',
  image: 'bg-pink-500/20 text-pink-400',
}

function CapabilityItem({ name, enabled }: { name: string; enabled: boolean }) {
  const config = CAPABILITY_CONFIG[name]
  if (!config) return null

  const Icon = config.icon

  return (
    <div className={cn(
      'flex items-center gap-2 text-sm',
      enabled ? 'text-white' : 'text-white/30'
    )}>
      <div className={cn(
        'w-4 h-4 rounded flex items-center justify-center',
        enabled ? 'bg-skinny-yellow/20 text-skinny-yellow' : 'bg-white/5'
      )}>
        {enabled ? <Check size={10} /> : null}
      </div>
      <Icon size={14} className={enabled ? 'text-skinny-yellow' : ''} />
      <span>{config.label}</span>
    </div>
  )
}

function ParamItem({ param, isRequired }: { param: ParamSpec; isRequired: boolean }) {
  return (
    <div className="text-sm space-y-1">
      <div className="flex items-center gap-2">
        <span className={cn(
          'font-mono',
          isRequired ? 'text-white font-medium' : 'text-white/70'
        )}>
          {param.name}
        </span>
        <span className={cn(
          'px-1.5 py-0.5 rounded text-[10px] font-medium',
          PARAM_TYPE_COLORS[param.type] || 'bg-zinc-700 text-white/50'
        )}>
          {param.type}
        </span>
        {isRequired && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">
            required
          </span>
        )}
      </div>
      <p className="text-white/40 text-xs pl-0">{param.description}</p>
      {param.options && (
        <p className="text-white/30 text-xs font-mono">
          [{param.options.slice(0, 4).join(', ')}{param.options.length > 4 ? '...' : ''}]
        </p>
      )}
      {param.default !== undefined && (
        <p className="text-white/30 text-xs">
          default: <span className="font-mono text-white/40">{String(param.default)}</span>
        </p>
      )}
      {param.range && (
        <p className="text-white/30 text-xs">
          range: <span className="font-mono text-white/40">{param.range.min} - {param.range.max}</span>
        </p>
      )}
    </div>
  )
}

export function ModelCard({ model, onToggle, onDelete, togglingId }: ModelCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const { spec, hasSpec } = model

  return (
    <div className="bg-zinc-950 border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Collapsed Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            model.category === 'video' ? 'bg-purple-500/10' : 'bg-skinny-yellow/10'
          )}>
            {model.category === 'video' ? (
              <Video size={16} className="text-purple-400" />
            ) : (
              <Image size={16} className="text-skinny-yellow" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white truncate">{model.name}</h3>
              {!hasSpec && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">
                  <AlertCircle size={10} />
                  <span className="text-[10px]">No spec</span>
                </div>
              )}
            </div>
            <p className="text-xs text-white/40 font-mono truncate">{model.replicate_model}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-sm text-white/60">{formatCost(model)}</span>

          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
            model.is_active
              ? 'bg-green-500/10 text-green-400'
              : 'bg-red-500/10 text-red-400'
          )}>
            {model.is_active ? <Check size={10} /> : <X size={10} />}
            {model.is_active ? 'Active' : 'Inactive'}
          </span>

          {/* Actions Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-1.5 rounded hover:bg-white/[0.05] text-white/40 hover:text-white transition-colors"
            >
              <MoreVertical size={14} />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                  }}
                />
                <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-white/[0.08] rounded-lg shadow-xl z-20 overflow-hidden">
                  <Link
                    href={`/admin/models/${model.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.05]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Edit2 size={12} />
                    Edit
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggle(model)
                      setShowMenu(false)
                    }}
                    disabled={togglingId === model.id}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/[0.05]"
                  >
                    {togglingId === model.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : model.is_active ? (
                      <X size={12} />
                    ) : (
                      <Check size={12} />
                    )}
                    {model.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(model)
                      setShowMenu(false)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Expand/Collapse */}
          <div className="text-white/40">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && spec && (
        <div className="px-4 pb-4 border-t border-white/[0.04] bg-zinc-900/30">
          {/* When to Use */}
          <div className="pt-4 pb-3">
            <h4 className="text-[10px] uppercase tracking-wider text-white/40 mb-2">When to Use</h4>
            <p className="text-sm text-white/70">{spec.whenToUse}</p>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-2 gap-6 py-3 border-t border-white/[0.04]">
            {/* Capabilities */}
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Capabilities</h4>
              <div className="space-y-2">
                {Object.entries(CAPABILITY_CONFIG).map(([key]) => (
                  <CapabilityItem
                    key={key}
                    name={key}
                    enabled={!!(spec.capabilities as Record<string, boolean>)?.[key]}
                  />
                ))}
              </div>

              {/* API Config */}
              {(spec.imageInputParam || spec.maxReferenceImages) && (
                <div className="mt-4 pt-3 border-t border-white/[0.04]">
                  <h4 className="text-[10px] uppercase tracking-wider text-white/40 mb-2">API Config</h4>
                  <div className="space-y-1 font-mono text-xs">
                    {spec.imageInputParam && (
                      <p className="text-white/60">
                        imageInputParam: <span className="text-skinny-yellow">"{spec.imageInputParam}"</span>
                      </p>
                    )}
                    {spec.maxReferenceImages && (
                      <p className="text-white/60">
                        maxReferenceImages: <span className="text-skinny-yellow">{spec.maxReferenceImages}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Parameters */}
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-white/40 mb-3">Parameters</h4>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {spec.params.required.map((param) => (
                  <ParamItem key={param.name} param={param} isRequired={true} />
                ))}
                {spec.params.optional.map((param) => (
                  <ParamItem key={param.name} param={param} isRequired={false} />
                ))}
              </div>
            </div>
          </div>

          {/* Tips */}
          {spec.tips && spec.tips.length > 0 && (
            <div className="pt-3 border-t border-white/[0.04]">
              <h4 className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Tips</h4>
              <ul className="space-y-1">
                {spec.tips.map((tip, i) => (
                  <li key={i} className="text-sm text-white/50 flex items-start gap-2">
                    <span className="text-skinny-yellow mt-1.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Expanded but no spec */}
      {expanded && !spec && (
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.04] bg-zinc-900/30">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <AlertCircle size={16} className="text-orange-400 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-orange-400 font-medium">No orchestrator spec found</p>
              <p className="text-white/50 mt-0.5">
                This model exists in the database but has no matching entry in model-specs.ts.
                Add a spec to enable AI-assisted model selection.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
