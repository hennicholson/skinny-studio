'use client'

// EntityPickerField — used by NodeSettingsModal for the `entity` node type.
//
// Behaviour mirrors SkillPickerField (see NodeSettingsModal.tsx):
//   - Loads from GET /api/entities with whop headers.
//   - Renders a small picker UI inside a labeled Field-style container.
//   - Calls onChange with everything the entity node's `data` needs to
//     populate: id (mapped to entityId), title (entity name), imageUrl,
//     visionContext.
//
// UI:
//   - Tab strip at top: All / Characters / Worlds / Objects / Styles.
//   - Grid of cards below: thumbnail + name + storyboard pill.
//   - Loading skeleton (shimmer cards), error state, empty state.
//
// Why no useWhopHeaders dep in the effect deps array beyond the callback ref:
//   the hook returns a stable useCallback function; including it is safe but
//   the underlying identity doesn't change between renders. We still list it
//   to satisfy exhaustive-deps.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  User,
  Globe,
  Box,
  Palette,
  ImageOff,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'

interface GlobalEntity {
  id: string
  name: string
  type: string
  vision_context: string | null
  image_url: string | null
  storyboard_id: string
  storyboard_title: string | null
}

type TabKey = 'all' | 'character' | 'world' | 'object' | 'style'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'character', label: 'Characters' },
  { key: 'world', label: 'Worlds' },
  { key: 'object', label: 'Objects' },
  { key: 'style', label: 'Styles' },
]

interface EntityPickerFieldProps {
  selectedId?: string
  onChange: (entity: {
    id: string
    title: string
    imageUrl?: string
    visionContext?: string
  }) => void
}

export function EntityPickerField({
  selectedId,
  onChange,
}: EntityPickerFieldProps) {
  const getHeaders = useWhopHeaders()
  const [entities, setEntities] = useState<GlobalEntity[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/entities', { headers: getHeaders() })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
        return data
      })
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d.entities)) setEntities(d.entities)
        else setEntities([])
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [getHeaders, reloadKey])

  const filtered = useMemo(() => {
    if (!entities) return []
    if (activeTab === 'all') return entities
    return entities.filter((e) => e.type === activeTab)
  }, [entities, activeTab])

  return (
    <div>
      <label className="block text-[11px] text-zinc-400 mb-1.5">Entity</label>

      {/* Tab strip — mirrors the segmented look of the modal's inputs. */}
      <div
        role="tablist"
        aria-label="Entity type"
        className="flex gap-1 mb-2 p-0.5 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] overflow-x-auto"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-fit px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 ${
                isActive
                  ? 'bg-skinny-yellow/15 text-skinny-yellow ring-1 ring-skinny-yellow/30'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Card grid container — matches SkillPickerField's surface treatment. */}
      <div className="rounded-lg ring-1 ring-white/[0.06] bg-white/[0.02] max-h-72 overflow-y-auto p-2">
        {loading ? (
          <LoadingGrid />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !entities || entities.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-zinc-500">
            no {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} in your library yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((ent) => (
              <EntityCard
                key={ent.id}
                entity={ent}
                active={ent.id === selectedId}
                onPick={() =>
                  onChange({
                    id: ent.id,
                    title: ent.name,
                    imageUrl: ent.image_url || undefined,
                    visionContext: ent.vision_context || undefined,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EntityCard({
  entity,
  active,
  onPick,
}: {
  entity: GlobalEntity
  active: boolean
  onPick: () => void
}) {
  const Icon = iconForType(entity.type)

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-label={`${entity.name} (${entity.type})`}
      className={`group relative rounded-md overflow-hidden ring-1 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 ${
        active
          ? 'ring-skinny-yellow/60 bg-skinny-yellow/[0.06]'
          : 'ring-white/[0.06] bg-white/[0.02] hover:ring-white/[0.18] hover:bg-white/[0.04]'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-zinc-900/60">
        {entity.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entity.image_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.opacity = '0.2'
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon
              size={18}
              aria-hidden="true"
              className={active ? 'text-skinny-yellow' : 'text-zinc-600'}
            />
          </div>
        )}
        {/* Type chip */}
        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-sm bg-black/70 backdrop-blur-sm text-[9px] uppercase tracking-wide text-zinc-300 font-medium">
          {entity.type}
        </div>
        {/* Selected checkmark — bottom-right corner so it doesn't fight the
            type chip. Only renders when active. */}
        {active && (
          <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-skinny-yellow text-black flex items-center justify-center shadow-md">
            <Check size={9} strokeWidth={3} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="px-2 py-1.5">
        <div
          className={`text-[11px] truncate ${
            active ? 'text-zinc-50' : 'text-zinc-100'
          }`}
        >
          {entity.name}
        </div>
        {entity.storyboard_title && (
          <div className="text-[9px] text-zinc-500 truncate mt-0.5">
            {entity.storyboard_title}
          </div>
        )}
      </div>
    </button>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="px-3 py-4 flex flex-col items-center gap-2 text-[11px] text-rose-300/90"
    >
      <AlertTriangle size={14} aria-hidden="true" />
      <p className="text-center leading-relaxed">couldn&rsquo;t load entities — {message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-2.5 py-1 rounded-md bg-white/[0.05] ring-1 ring-white/[0.08] text-zinc-200 hover:bg-white/[0.08] hover:ring-skinny-yellow/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors"
      >
        try again
      </button>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-md ring-1 ring-white/[0.04] bg-white/[0.02] overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-white/[0.03]" />
          <div className="px-2 py-1.5 space-y-1">
            <div className="h-2 rounded bg-white/[0.05] w-3/4" />
            <div className="h-1.5 rounded bg-white/[0.03] w-1/2" />
          </div>
        </div>
      ))}
      <div className="col-span-2 flex items-center justify-center gap-2 py-2 text-[10px] text-zinc-600" aria-live="polite">
        <Loader2 size={10} className="animate-spin" aria-hidden="true" />
        loading entities…
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="px-3 py-6 text-center text-[11px] text-zinc-500 leading-relaxed">
      <ImageOff size={14} className="text-zinc-600 mx-auto mb-1.5" aria-hidden="true" />
      no entities yet — create characters, worlds, or styles in a storyboard first.
    </div>
  )
}

function iconForType(type: string) {
  switch (type) {
    case 'character':
      return User
    case 'world':
      return Globe
    case 'object':
      return Box
    case 'style':
      return Palette
    default:
      return Box
  }
}
