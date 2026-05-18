'use client'

// Command-palette node picker. Full-screen overlay → centered dark card on
// desktop, bottom sheet on mobile → left categories + right node list +
// bottom "keep open" toggle.
//
// Polish pass:
//   - Keyboard nav (↑/↓/Enter/Esc/`/`)
//   - Recently-used tracking via localStorage
//   - Mobile bottom-sheet layout (< sm)
//   - Disabled-row affordance
//   - Search highlighting + dimmed non-matches
//   - Empty-state with quick "Create blank node" fallbacks
//   - Focus trap

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search,
  ChevronRight,
  Type,
  Image as ImageIcon,
  Film,
  Sparkles,
  Users,
  Eye,
  Shuffle,
  Bot,
  X,
  CornerDownLeft,
  ArrowDownUp,
  Lock,
  Plus,
  ScrollText,
} from 'lucide-react'
import { NodeType } from '@/lib/canvas/ir'
import { StudioModelLite } from './types'

export interface NewNodeRequest {
  type: NodeType
  modelSlug?: string
  modelName?: string
}

interface AddNodeModalProps {
  open: boolean
  onClose: () => void
  onAdd: (req: NewNodeRequest) => void
  models: StudioModelLite[]
  keepOpenDefault?: boolean
}

type Category = 'all' | 'recent' | 'image' | 'video' | 'text' | 'utility'

interface PaletteRow {
  key: string
  name: string
  hint: string
  Icon: any
  category: Exclude<Category, 'all' | 'recent'>
  payload: NewNodeRequest
  disabled?: boolean
}

const ICON_BY_TYPE: Record<NodeType, any> = {
  'text-prompt': Type,
  'reference-image': ImageIcon,
  entity: Users,
  skill: Sparkles,
  'image-gen': ImageIcon,
  'video-gen': Film,
  'fan-out': Shuffle,
  output: Eye,
  orchestrator: Bot,
  'production-brief': ScrollText,
}

const RECENT_KEY = 'skinny-canvas-recent-nodes'
const RECENT_LIMIT = 8

function loadRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((v: unknown) => typeof v === 'string').slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function pushRecent(key: string) {
  if (typeof window === 'undefined') return
  try {
    const prev = loadRecent().filter((k) => k !== key)
    const next = [key, ...prev].slice(0, RECENT_LIMIT)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

// Highlight matched substring of `text` for query `q`. Returns React nodes.
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const q = query.trim()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(ql, i)
    if (idx === -1) {
      parts.push(<span key={i}>{text.slice(i)}</span>)
      break
    }
    if (idx > i) parts.push(<span key={`p-${i}`}>{text.slice(i, idx)}</span>)
    parts.push(
      <span key={`m-${idx}`} className="text-skinny-yellow font-semibold">
        {text.slice(idx, idx + ql.length)}
      </span>,
    )
    i = idx + ql.length
  }
  return <>{parts}</>
}

export function AddNodeModal({ open, onClose, onAdd, models, keepOpenDefault = false }: AddNodeModalProps) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<Category>('all')
  const [keepOpen, setKeepOpen] = useState(keepOpenDefault)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recent, setRecent] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Reset when (re)opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setCat('all')
      setActiveIndex(0)
      setRecent(loadRecent())
      // Defer focus until after the modal animates in
      const t = window.setTimeout(() => inputRef.current?.focus(), 60)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const rows: PaletteRow[] = useMemo(() => {
    const base: PaletteRow[] = [
      {
        key: 'text-prompt',
        name: 'Text prompt',
        hint: 'Text input',
        Icon: ICON_BY_TYPE['text-prompt'],
        category: 'text',
        payload: { type: 'text-prompt' },
      },
      {
        key: 'reference-image',
        name: 'Reference image',
        hint: 'Image input',
        Icon: ICON_BY_TYPE['reference-image'],
        category: 'image',
        payload: { type: 'reference-image' },
      },
      {
        key: 'skill',
        name: 'Skill',
        hint: 'Saved prompt template',
        Icon: ICON_BY_TYPE.skill,
        category: 'text',
        payload: { type: 'skill' },
      },
      {
        key: 'entity',
        name: 'Entity',
        hint: 'Character / world / object / style',
        Icon: ICON_BY_TYPE.entity,
        category: 'utility',
        payload: { type: 'entity' },
      },
      {
        key: 'fan-out',
        name: 'Fan-out',
        hint: 'Multiple variations of upstream',
        Icon: ICON_BY_TYPE['fan-out'],
        category: 'utility',
        payload: { type: 'fan-out' },
      },
      {
        key: 'orchestrator',
        name: 'Creative Director',
        hint: 'AI prompt assistant',
        Icon: ICON_BY_TYPE.orchestrator,
        category: 'utility',
        payload: { type: 'orchestrator' },
      },
      {
        key: 'production-brief',
        name: 'Production Brief',
        hint: 'Storyboard + concept → 2500-char Seedance prompt',
        Icon: ICON_BY_TYPE['production-brief'],
        category: 'utility',
        payload: { type: 'production-brief' },
      },
      // Output node removed from palette — model nodes ARE the output now.
      // NodeType still exists in IR for back-compat with old canvases.
    ]

    for (const m of models) {
      const isVideo = m.category === 'video'
      base.push({
        key: `model:${m.slug}`,
        name: m.name,
        hint: isVideo ? 'Text/Image to Video' : 'Text/Image to Image',
        Icon: isVideo ? Film : ImageIcon,
        category: isVideo ? 'video' : 'image',
        payload: {
          type: isVideo ? 'video-gen' : 'image-gen',
          modelSlug: m.slug,
          modelName: m.name,
        },
      })
    }
    return base
  }, [models])

  // Build the filtered set in the same order the user sees it:
  // - Recently used category: ordered by recent list
  // - Otherwise: original row order
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byKey = new Map(rows.map((r) => [r.key, r]))

    if (cat === 'recent') {
      const list: PaletteRow[] = []
      for (const key of recent) {
        const r = byKey.get(key)
        if (!r) continue
        if (!q || r.name.toLowerCase().includes(q) || r.hint.toLowerCase().includes(q)) {
          list.push(r)
        }
      }
      return list
    }

    return rows.filter((r) => {
      if (cat !== 'all' && r.category !== cat) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.hint.toLowerCase().includes(q)
    })
  }, [rows, query, cat, recent])

  // Keep active index in range whenever results change
  useEffect(() => {
    setActiveIndex((i) => {
      if (filtered.length === 0) return 0
      return Math.min(i, filtered.length - 1)
    })
  }, [filtered.length])

  // Scroll active item into view
  useLayoutEffect(() => {
    const el = itemRefs.current[activeIndex]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  const pick = useCallback(
    (row: PaletteRow) => {
      if (row.disabled) return
      pushRecent(row.key)
      onAdd(row.payload)
      if (!keepOpen) onClose()
      else {
        // Refresh recent list so the next open reflects the new entry
        setRecent(loadRecent())
      }
    },
    [onAdd, keepOpen, onClose],
  )

  // Global key handling (Esc, /, ↑/↓, Enter, Tab focus trap)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      // `/` focuses the search input (unless already typing in it)
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'Enter') {
        const row = filtered[activeIndex]
        if (row && !row.disabled) {
          e.preventDefault()
          pick(row)
        }
        return
      }
      // Focus trap on Tab
      if (e.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, filtered, activeIndex, pick])

  const categories: { key: Category; label: string }[] = [
    { key: 'all', label: 'New nodes' },
    { key: 'recent', label: 'Recently used' },
    { key: 'video', label: 'Video' },
    { key: 'image', label: 'Image' },
    { key: 'text', label: 'Text' },
    { key: 'utility', label: 'Utility' },
  ]

  const hasQuery = query.trim().length > 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Add node"
        >
          <motion.div
            ref={cardRef}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            // Mobile height uses `dvh` (dynamic viewport) so the sheet
            // shrinks when iOS Safari's on-screen keyboard appears — keeps
            // the focused search input visible during typing.
            className="relative w-full sm:max-w-2xl h-[85dvh] sm:h-[560px] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl bg-zinc-950 ring-1 ring-white/10 overflow-hidden flex flex-col shadow-2xl"
          >
            {/* Mobile drag handle (visual) */}
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-9 h-1 rounded-full bg-white/15" />
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <Search size={14} className="text-zinc-500 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or type"
                aria-label="Search nodes"
                // 16px on mobile prevents the iOS Safari zoom-on-focus behavior
                // that would otherwise scale the page when this opens.
                className="flex-1 bg-transparent text-base sm:text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none min-w-0 py-1"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              <kbd className="hidden sm:inline-flex items-center justify-center text-[10px] text-zinc-500 px-1.5 h-5 rounded ring-1 ring-white/10 bg-white/[0.03] font-mono">
                /
              </kbd>
              <button
                type="button"
                onClick={onClose}
                className="relative w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors after:absolute after:-inset-2 after:content-['']"
                aria-label="Close add-node panel"
              >
                <X size={14} className="text-zinc-400" aria-hidden />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Categories — horizontal scroll on mobile, vertical sidebar on sm+ */}
              <nav
                aria-label="Node categories"
                className="sm:w-44 sm:shrink-0 sm:border-r border-b sm:border-b-0 border-white/[0.06] sm:overflow-y-auto overflow-x-auto sm:p-2 px-2 py-1.5 flex sm:block sm:space-y-0.5 gap-1 sm:gap-0 scrollbar-thin"
              >
                {categories.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCat(c.key)}
                    aria-pressed={cat === c.key}
                    className={`shrink-0 sm:w-full sm:text-left px-3 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-md text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 ${
                      cat === c.key
                        ? 'bg-white/[0.06] text-zinc-100 font-medium'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </nav>

              {/* List */}
              <ul
                ref={listRef}
                className="flex-1 overflow-y-auto py-2"
                role="listbox"
                aria-activedescendant={filtered[activeIndex] ? `node-row-${filtered[activeIndex].key}` : undefined}
              >
                {filtered.length === 0 ? (
                  <EmptyState query={query} category={cat} onPick={pick} rows={rows} />
                ) : (
                  filtered.map((row, idx) => {
                    const Icon = row.Icon
                    const isActive = idx === activeIndex
                    const dimmed = hasQuery && !isActive
                    return (
                      <li key={row.key}>
                        <button
                          id={`node-row-${row.key}`}
                          type="button"
                          ref={(el) => {
                            itemRefs.current[idx] = el
                          }}
                          onClick={() => pick(row)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          disabled={row.disabled}
                          role="option"
                          aria-selected={isActive}
                          aria-disabled={row.disabled || undefined}
                          className={`group relative w-full flex items-center gap-3 px-4 py-3 transition-all duration-100 outline-none focus-visible:bg-white/[0.08] ${
                            row.disabled
                              ? 'opacity-40 cursor-not-allowed'
                              : 'cursor-pointer'
                          } ${
                            isActive && !row.disabled
                              ? 'bg-white/[0.06]'
                              : 'hover:bg-white/[0.04]'
                          } ${dimmed && !isActive ? 'opacity-60' : ''}`}
                        >
                          {/* Focus indicator bar */}
                          <span
                            className={`absolute left-0 w-[2px] h-7 rounded-r-full transition-all ${
                              isActive && !row.disabled ? 'bg-skinny-yellow' : 'bg-transparent'
                            }`}
                            aria-hidden
                          />
                          <div className="w-9 h-9 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] flex items-center justify-center shrink-0">
                            {row.disabled ? (
                              <Lock size={12} className="text-zinc-500" />
                            ) : (
                              <Icon size={14} className="text-zinc-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm text-zinc-100 truncate">
                              <Highlight text={row.name} query={query} />
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">
                              {row.disabled ? 'Disabled by your admin' : row.hint}
                            </div>
                          </div>
                          <ChevronRight
                            size={14}
                            className={`shrink-0 transition-colors ${
                              isActive && !row.disabled ? 'text-skinny-yellow' : 'text-zinc-600'
                            }`}
                          />
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-zinc-600">
                <span className="inline-flex items-center gap-1">
                  <ArrowDownUp size={10} /> navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft size={10} /> select
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="font-mono">esc</kbd> close
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
                <span className="text-[11px] text-zinc-500">Keep open</span>
                <button
                  type="button"
                  onClick={() => setKeepOpen((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 ${
                    keepOpen ? 'bg-skinny-yellow' : 'bg-zinc-700 hover:bg-zinc-600'
                  }`}
                  aria-pressed={keepOpen}
                  aria-label="Keep this panel open after adding a node"
                  role="switch"
                  aria-checked={keepOpen}
                >
                  <span
                    aria-hidden
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      keepOpen ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// =====================================================================
// Friendly empty state with quick "Create blank node" fallbacks.
// =====================================================================
function EmptyState({
  query,
  category,
  onPick,
  rows,
}: {
  query: string
  category: Category
  onPick: (row: PaletteRow) => void
  rows: PaletteRow[]
}) {
  const quick = useMemo(() => {
    // Curated fallbacks — only show rows that actually exist in the palette
    // (output was removed; gracefully degrade so we don't render dead chips).
    const byKey = new Map(rows.map((r) => [r.key, r]))
    const keys = ['text-prompt', 'reference-image', 'skill']
    return keys.map((k) => byKey.get(k)).filter(Boolean) as PaletteRow[]
  }, [rows])

  const isRecentEmpty = category === 'recent' && !query.trim()

  return (
    <div className="px-6 py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-white/[0.04] ring-1 ring-white/[0.06] flex items-center justify-center mx-auto mb-3">
        {isRecentEmpty ? (
          <Sparkles size={16} className="text-zinc-500" />
        ) : (
          <Search size={16} className="text-zinc-500" />
        )}
      </div>
      <p className="text-sm text-zinc-300 font-medium">
        {isRecentEmpty ? 'No recent nodes yet' : 'No matches'}
      </p>
      <p className="text-[11px] text-zinc-500 mt-1 mb-5">
        {isRecentEmpty
          ? 'Nodes you add will show up here for quick access.'
          : query.trim()
            ? <>Nothing matches &ldquo;<span className="text-zinc-300">{query.trim()}</span>&rdquo;.</>
            : 'Try a different category.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {quick.map((row) => {
          const Icon = row.Icon
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onPick(row)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ring-1 ring-white/[0.08] bg-white/[0.03] text-[11px] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors"
            >
              <Plus size={11} className="text-zinc-500" />
              <Icon size={11} className="text-zinc-400" />
              {row.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
