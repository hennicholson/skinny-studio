'use client'

// Keyboard shortcuts overlay. Toggled with `?`. Listens at the editor scope
// so it doesn't fight global handlers.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Keyboard } from 'lucide-react'

const SHORTCUT_GROUPS: Array<{ heading: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    heading: 'Tools',
    items: [
      { keys: ['V'], label: 'Select tool' },
      { keys: ['B'], label: 'Razor (split on click)' },
      { keys: ['C'], label: 'Split selected clip at playhead' },
    ],
  },
  {
    heading: 'Transport',
    items: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['J'], label: 'Rewind 1s' },
      { keys: ['K'], label: 'Pause' },
      { keys: ['L'], label: 'Forward 1s' },
      { keys: ['←', '→'], label: 'Step ±1 frame' },
      { keys: ['Shift', '←/→'], label: 'Step ±1 second' },
      { keys: ['Home'], label: 'Jump to start' },
      { keys: ['End'], label: 'Jump to end' },
    ],
  },
  {
    heading: 'View',
    items: [
      { keys: ['+'], label: 'Zoom in' },
      { keys: ['−'], label: 'Zoom out' },
      { keys: ['1'], label: 'Switch to canvas mode' },
      { keys: ['2'], label: 'Switch to timeline mode' },
    ],
  },
  {
    heading: 'Clips',
    items: [
      { keys: ['['], label: 'Set in-point at playhead' },
      { keys: [']'], label: 'Set out-point at playhead' },
      { keys: ['Delete'], label: 'Delete selected clip' },
    ],
  },
  {
    heading: 'Editor',
    items: [
      { keys: ['⌘', 'Z'], label: 'Undo' },
      { keys: ['⌘', 'Shift', 'Z'], label: 'Redo' },
      { keys: ['⌘', 'S'], label: 'Force save' },
      { keys: ['E'], label: 'Export' },
      { keys: ['?'], label: 'Show this cheatsheet' },
    ],
  },
]

export function ShortcutsCheatsheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.key === '?') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal
          aria-label="Keyboard shortcuts"
        >
          <motion.div
            className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-black/95 p-6 shadow-2xl backdrop-blur-xl"
            initial={{ scale: 0.95, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4 flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-skinny-yellow/15 text-skinny-yellow">
                <Keyboard className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-white">Shortcuts</h2>
                <p className="mt-0.5 text-xs text-white/50">Speed up your edit.</p>
              </div>
              <button
                type="button"
                aria-label="Close shortcuts"
                onClick={() => setOpen(false)}
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 max-h-[70vh] overflow-y-auto pr-1">
              {SHORTCUT_GROUPS.map((group) => (
                <section key={group.heading}>
                  <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
                    {group.heading}
                  </h3>
                  <ul className="space-y-1">
                    {group.items.map((sc) => (
                      <li
                        key={sc.label}
                        className="flex items-center justify-between gap-3 rounded px-1 py-1 text-[13px]"
                      >
                        <span className="truncate text-white/70">{sc.label}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {sc.keys.map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/80"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
