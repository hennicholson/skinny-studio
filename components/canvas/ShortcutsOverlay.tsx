'use client'

// Keyboard shortcuts overlay. Centered glass modal, grouped list, filter input.
// Pure presentation — the registry lives in `lib/canvas/shortcuts.ts`.
//
// UX notes:
//   - Esc + backdrop click both close.
//   - Search filters across description, group label, and rendered key tokens
//     so users can type "cmd k", "zoom", or "run" and find what they expect.
//   - Matched substrings inside descriptions are highlighted in skinny-yellow,
//     matching the AddNodeModal treatment.
//   - kbd tokens get a small monospaced chip with subtle inner shadow so they
//     feel "physical" without screaming for attention.
//   - On mobile we drop the two-column grid to a single column so rows stay
//     readable and key chips don't wrap into ugly stacks.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X, Keyboard } from 'lucide-react'
import {
  SHORTCUTS,
  GROUP_LABELS,
  renderKeyTokens,
  Shortcut,
  ShortcutGroup,
} from '@/lib/canvas/shortcuts'

interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

// Substring highlighter — mirrors AddNodeModal's treatment.
function Highlight({ text, query }: { text: string; query: string }) {
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

function KeyChip({ token }: { token: string }) {
  // Special-case "drag" — it's a gesture, not a key, so render it as a
  // lowercase pill without the chunky border.
  const isGesture = token.toLowerCase() === 'drag'
  if (isGesture) {
    return (
      <span className="text-[10px] uppercase tracking-wide text-white/40 px-1.5 py-0.5">
        {token}
      </span>
    )
  }
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2
                 text-[11px] font-medium font-mono text-white/85
                 bg-white/[0.06] border border-white/[0.08] rounded-md
                 shadow-[inset_0_-1px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {token}
    </kbd>
  )
}

function Row({ shortcut, query }: { shortcut: Shortcut; query: string }) {
  const tokens = renderKeyTokens(shortcut.keys)
  return (
    <li className="group flex items-center justify-between gap-4 px-3 py-2 rounded-lg
                   hover:bg-white/[0.03] transition-colors">
      <span className="text-sm text-white/75 group-hover:text-white/95 transition-colors">
        <Highlight text={shortcut.description} query={query} />
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {tokens.map((t, i) => (
          <span key={`${shortcut.id}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-white/25 text-[10px]">+</span>}
            <KeyChip token={t} />
          </span>
        ))}
      </span>
    </li>
  )
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Reset query each open + autofocus search.
  useEffect(() => {
    if (!open) return
    setQuery('')
    const t = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open])

  // Esc to close + focus trap.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [open, onClose])

  // Filter — match against description, group label, and the rendered key
  // tokens (so "cmd k" or "ctrl k" both surface the alt picker shortcut).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byGroup = new Map<ShortcutGroup, Shortcut[]>()
    for (const s of SHORTCUTS) {
      if (q) {
        const groupLabel = GROUP_LABELS.find((g) => g.key === s.group)?.label ?? ''
        const tokens = renderKeyTokens(s.keys).join(' ').toLowerCase()
        const hay = `${s.description} ${groupLabel} ${tokens}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      const arr = byGroup.get(s.group) ?? []
      arr.push(s)
      byGroup.set(s.group, arr)
    }
    return GROUP_LABELS.map((g) => ({
      ...g,
      items: byGroup.get(g.key) ?? [],
    })).filter((g) => g.items.length > 0)
  }, [query])

  const totalMatches = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shortcuts-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center
                     bg-black/70 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
          onMouseDown={(e) => {
            // Backdrop click closes — only when the press starts on the backdrop
            // itself (not a child that bubbled up).
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={cardRef}
            key="shortcuts-card"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            className="relative w-full max-w-2xl mt-8 sm:mt-0
                       bg-[#0b0b0b]/95 backdrop-blur-xl
                       border border-white/[0.08] rounded-2xl
                       shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]
                       overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-skinny-yellow/10 border border-skinny-yellow/20
                              flex items-center justify-center">
                <Keyboard className="w-4 h-4 text-skinny-yellow" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-white/90">Keyboard shortcuts</h2>
                <p className="text-[11px] text-white/40">
                  {totalMatches} {totalMatches === 1 ? 'shortcut' : 'shortcuts'}
                  {query ? ' matched' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close shortcuts"
                className="relative w-8 h-8 rounded-lg flex items-center justify-center
                           text-white/40 hover:text-white/80 hover:bg-white/[0.05]
                           transition-colors after:absolute after:-inset-2 after:content-['']
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search shortcuts…"
                  className="w-full h-10 pl-9 pr-3 text-sm
                             bg-white/[0.03] border border-white/[0.06] rounded-lg
                             text-white/90 placeholder:text-white/30
                             focus:outline-none focus:border-skinny-yellow/40
                             focus:bg-white/[0.05] transition-colors"
                />
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {groups.length === 0 ? (
                <div className="py-12 text-center text-sm text-white/40">
                  No shortcuts match &ldquo;{query}&rdquo;
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                  {groups.map((g) => (
                    <section key={g.key}>
                      <h3 className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]
                                     text-white/35">
                        {g.label}
                      </h3>
                      <ul>
                        {g.items.map((s) => (
                          <Row key={s.id} shortcut={s} query={query} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-white/[0.06]
                            flex items-center justify-between text-[11px] text-white/35">
              <span>
                Press <KeyChip token="?" /> any time to open this panel
              </span>
              <span className="flex items-center gap-1">
                <KeyChip token="Esc" />
                <span>to close</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
