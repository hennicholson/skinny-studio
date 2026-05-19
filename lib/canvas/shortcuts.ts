// Keyboard shortcut registry for the canvas editor.
//
// Pure data + small format helper. No DOM listeners attached here — CanvasShell
// owns its own handlers; this file only describes the surface so the overlay
// (and future docs/help) can render them consistently.
//
// To add a shortcut: append to SHORTCUTS with a stable `id`, a `keys` array
// (use the canonical Mac glyphs '⌘', '⇧', '⌥', '⌃' — formatKeys swaps them
// for non-Mac platforms), a description, and a group.

export type ShortcutGroup = 'navigation' | 'editing' | 'view' | 'run'

export interface Shortcut {
  id: string
  keys: string[]
  description: string
  group: ShortcutGroup
}

export const SHORTCUTS: Shortcut[] = [
  // ── Navigation ───────────────────────────────────────────────────────────
  {
    id: 'open-shortcuts',
    keys: ['?'],
    description: 'Open keyboard shortcuts',
    group: 'navigation',
  },
  {
    id: 'open-node-picker',
    keys: ['/'],
    description: 'Open node picker',
    group: 'navigation',
  },
  {
    id: 'open-node-picker-alt',
    keys: ['⌘', 'K'],
    description: 'Open node picker (alt)',
    group: 'navigation',
  },
  {
    id: 'close-modal',
    keys: ['Esc'],
    description: 'Close open modal / palette',
    group: 'navigation',
  },
  {
    id: 'go-to-canvases',
    keys: ['g'],
    description: 'Go to all canvases',
    group: 'navigation',
  },

  // ── Editing ──────────────────────────────────────────────────────────────
  {
    id: 'undo',
    keys: ['⌘', 'Z'],
    description: 'Undo',
    group: 'editing',
  },
  {
    id: 'redo',
    keys: ['⌘', '⇧', 'Z'],
    description: 'Redo',
    group: 'editing',
  },
  {
    id: 'delete-selected',
    keys: ['Del'],
    description: 'Delete selected node(s)',
    group: 'editing',
  },
  {
    id: 'duplicate-selected',
    keys: ['⌘', 'D'],
    description: 'Duplicate selected node(s)',
    group: 'editing',
  },
  {
    id: 'edit-selected',
    keys: ['Enter'],
    description: 'Edit selected (or double-click)',
    group: 'editing',
  },

  // ── View ─────────────────────────────────────────────────────────────────
  {
    id: 'fit-view',
    keys: ['⌘', '0'],
    description: 'Fit view to canvas',
    group: 'view',
  },
  {
    id: 'zoom-in',
    keys: ['⌘', '+'],
    description: 'Zoom in',
    group: 'view',
  },
  {
    id: 'zoom-out',
    keys: ['⌘', '-'],
    description: 'Zoom out',
    group: 'view',
  },
  {
    id: 'pan',
    keys: ['Space', 'drag'],
    description: 'Pan the canvas',
    group: 'view',
  },
  {
    id: 'tool-select',
    keys: ['s'],
    description: 'Select tool',
    group: 'view',
  },
  {
    id: 'tool-marquee',
    keys: ['m'],
    description: 'Marquee selection tool',
    group: 'view',
  },

  // ── Run ──────────────────────────────────────────────────────────────────
  {
    id: 'run-all',
    keys: ['⌘', 'Enter'],
    description: 'Run all nodes (or selected when 2+ are marquee-selected)',
    group: 'run',
  },
  {
    id: 'run-selected',
    keys: ['m'],
    description: 'Switch to marquee, drag to select multiple nodes → ⌘↵ runs only them',
    group: 'run',
  },
  {
    id: 'stop-run',
    keys: ['Esc'],
    description: 'Stop running canvas',
    group: 'run',
  },
]

// ── Platform detection ─────────────────────────────────────────────────────
// We resolve once at module-eval time on the client, and fall back to Mac on
// the server (matches our user base; the value gets overwritten on hydration
// before any kbd renders anyway).
function detectIsMac(): boolean {
  if (typeof navigator === 'undefined') return true
  const ua = navigator.userAgent || navigator.platform || ''
  return /Mac|iPhone|iPad|iPod/i.test(ua)
}

let _isMacCache: boolean | null = null
function isMac(): boolean {
  if (_isMacCache === null) _isMacCache = detectIsMac()
  return _isMacCache
}

// Map of Mac glyphs → Windows/Linux equivalents.
const NON_MAC_MAP: Record<string, string> = {
  '⌘': 'Ctrl',
  '⌃': 'Ctrl',
  '⌥': 'Alt',
  '⇧': 'Shift',
}

/**
 * Pretty-render a key combo for display. On non-Mac platforms, swaps Mac
 * glyphs for their Ctrl/Alt/Shift equivalents.
 *
 *   formatKeys(['⌘', 'K']) → "⌘ + K"          (Mac)
 *   formatKeys(['⌘', 'K']) → "Ctrl + K"       (Win/Linux)
 *   formatKeys(['Space', 'drag']) → "Space + drag"
 */
export function formatKeys(keys: string[]): string {
  const mac = isMac()
  return keys
    .map((k) => (mac ? k : NON_MAC_MAP[k] ?? k))
    .join(' + ')
}

/**
 * Return individual rendered tokens (useful for <kbd> styling per-token
 * rather than as a single string).
 */
export function renderKeyTokens(keys: string[]): string[] {
  const mac = isMac()
  return keys.map((k) => (mac ? k : NON_MAC_MAP[k] ?? k))
}

/**
 * Group → human label, in the order we want them surfaced in the UI.
 */
export const GROUP_LABELS: { key: ShortcutGroup; label: string }[] = [
  { key: 'navigation', label: 'Navigation' },
  { key: 'editing', label: 'Editing' },
  { key: 'view', label: 'View' },
  { key: 'run', label: 'Run' },
]
