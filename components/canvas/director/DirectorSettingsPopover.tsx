'use client'

// Director settings popover — provider toggle + user-supplied API key.
// Lives in the CreativeDirectorChat header, opens from the gear icon.
//
// Persists to localStorage:
//   - `skinny:director:provider`     'gemini' | 'qwen'
//   - `skinny:director:qwen-key`     DashScope key (user owns it)
//   - `skinny:director:qwen-model`   optional model id override
//
// We deliberately don't send the key to any of our own backend storage —
// it lives only in the user's browser localStorage and gets attached to
// each /api/chat request when Qwen is the selected provider.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Eye, EyeOff, Sparkles, MessageSquare, Layers, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DirectorProvider = 'gemini' | 'qwen'

const LS_PROVIDER = 'skinny:director:provider'
const LS_QWEN_KEY = 'skinny:director:qwen-key'
const LS_QWEN_MODEL = 'skinny:director:qwen-model'

const DEFAULT_QWEN_MODEL = 'qwen3.5-omni-plus'

/** Read current director settings from localStorage. SSR-safe.
    Default provider is Qwen-Omni now — Gemini is the explicit fallback. */
export function readDirectorSettings(): {
  provider: DirectorProvider
  qwenKey: string
  qwenModel: string
} {
  if (typeof window === 'undefined') {
    return { provider: 'qwen', qwenKey: '', qwenModel: DEFAULT_QWEN_MODEL }
  }
  // Explicit override wins; otherwise default to Qwen. Anyone with a stale
  // 'gemini' value from before this flip keeps using Gemini until they
  // change it themselves — we don't yank their preference.
  const stored = window.localStorage.getItem(LS_PROVIDER)
  const provider: DirectorProvider = stored === 'gemini' ? 'gemini' : 'qwen'
  const qwenKey = window.localStorage.getItem(LS_QWEN_KEY) || ''
  const qwenModel = window.localStorage.getItem(LS_QWEN_MODEL) || DEFAULT_QWEN_MODEL
  return { provider, qwenKey, qwenModel }
}

interface DirectorSettingsPopoverProps {
  open: boolean
  onClose: () => void
  /** Fires when settings change so the parent can re-trigger client setup. */
  onChange?: () => void
  /** Optional anchor — when null, the popover centers itself. */
  anchorRect?: DOMRect | null
}

export function DirectorSettingsPopover({
  open,
  onClose,
  onChange,
  anchorRect,
}: DirectorSettingsPopoverProps) {
  const [provider, setProvider] = useState<DirectorProvider>('gemini')
  const [qwenKey, setQwenKey] = useState('')
  const [qwenModel, setQwenModel] = useState(DEFAULT_QWEN_MODEL)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // Hydrate from localStorage when opened.
  useEffect(() => {
    if (!open) return
    const cur = readDirectorSettings()
    setProvider(cur.provider)
    setQwenKey(cur.qwenKey)
    setQwenModel(cur.qwenModel)
    setShowKey(false)
    setSaved(false)
  }, [open])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const save = () => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LS_PROVIDER, provider)
    window.localStorage.setItem(LS_QWEN_KEY, qwenKey.trim())
    window.localStorage.setItem(
      LS_QWEN_MODEL,
      qwenModel.trim() || DEFAULT_QWEN_MODEL,
    )
    setSaved(true)
    onChange?.()
    setTimeout(() => setSaved(false), 1400)
  }

  // Allow saving on ⌘/Ctrl+Enter.
  const onKeyInput = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="director-settings-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full max-w-md rounded-2xl overflow-hidden',
              'bg-zinc-900/98 backdrop-blur-xl',
              'border border-white/[0.08]',
              'shadow-2xl shadow-black/50',
            )}
          >
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/[0.05]">
              <h2 id="director-settings-title" className="text-sm font-medium text-zinc-100">
                director settings
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/40"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Provider picker */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-2">
                  provider
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <ProviderTile
                    label="Qwen-Omni"
                    subtitle="DashScope · default"
                    icon={Sparkles}
                    active={provider === 'qwen'}
                    onClick={() => setProvider('qwen')}
                  />
                  <ProviderTile
                    label="Gemini"
                    subtitle="2.5 Flash · fallback"
                    icon={MessageSquare}
                    active={provider === 'gemini'}
                    onClick={() => setProvider('gemini')}
                  />
                </div>
              </div>

              {/* Qwen-specific fields */}
              {provider === 'qwen' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* API key */}
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                      DashScope API key
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={qwenKey}
                        onChange={(e) => setQwenKey(e.target.value)}
                        onKeyDown={onKeyInput}
                        placeholder="sk-..."
                        spellCheck={false}
                        autoComplete="off"
                        className={cn(
                          'w-full h-9 pl-3 pr-9 rounded-lg',
                          'bg-white/[0.04] border border-white/[0.06]',
                          'text-[13px] text-white font-mono placeholder-zinc-600',
                          'focus:outline-none focus:border-skinny-yellow/40 focus:bg-white/[0.06]',
                          'transition-colors',
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? 'Hide key' : 'Show key'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
                      >
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[10.5px] text-zinc-500 leading-relaxed">
                      Optional — leave blank to use Skinny's shared key. If you have
                      your own, it runs on YOUR free credits instead. Stored only in
                      your browser; never sent to Skinny servers except when calling
                      the Director. Get a key from{' '}
                      <a
                        href="https://bailian.console.alibabacloud.com/?apiKey=1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-skinny-yellow/80 hover:text-skinny-yellow underline-offset-2 hover:underline inline-flex items-center gap-0.5"
                      >
                        Alibaba Cloud Model Studio
                        <ExternalLink size={9} />
                      </a>
                      .
                    </p>
                  </div>

                  {/* Model id override */}
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                      model
                    </label>
                    <input
                      type="text"
                      value={qwenModel}
                      onChange={(e) => setQwenModel(e.target.value)}
                      onKeyDown={onKeyInput}
                      placeholder={DEFAULT_QWEN_MODEL}
                      spellCheck={false}
                      autoComplete="off"
                      className={cn(
                        'w-full h-9 px-3 rounded-lg',
                        'bg-white/[0.04] border border-white/[0.06]',
                        'text-[13px] text-white font-mono placeholder-zinc-600',
                        'focus:outline-none focus:border-skinny-yellow/40 focus:bg-white/[0.06]',
                        'transition-colors',
                      )}
                    />
                    <p className="mt-1.5 text-[10.5px] text-zinc-500 leading-relaxed">
                      Default: <code className="text-zinc-400">{DEFAULT_QWEN_MODEL}</code>. Override if you have a different snapshot id (e.g. a dated revision).
                    </p>
                  </div>

                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2.5">
                    <Layers
                      size={11}
                      className="text-amber-400/80 inline-block align-middle mr-1.5"
                    />
                    <span className="text-[10.5px] text-amber-200/80 leading-relaxed">
                      Qwen-Omni has no function calling — the Director uses our
                      fenced-block protocol instead, which works on any text
                      LLM. Multi-ref + image input on the same turn are
                      Gemini-only for now.
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-black/30 border-t border-white/[0.05] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded-md text-[12px] font-medium text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/40"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={save}
                className={cn(
                  'h-8 px-4 rounded-md text-[12px] font-semibold transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                  'bg-skinny-yellow text-black hover:brightness-110 active:brightness-95',
                  'shadow-md shadow-skinny-yellow/15',
                )}
              >
                {saved ? 'saved' : 'save'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface ProviderTileProps {
  label: string
  subtitle: string
  icon: typeof MessageSquare
  active: boolean
  onClick: () => void
}

function ProviderTile({ label, subtitle, icon: Icon, active, onClick }: ProviderTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
        active
          ? 'bg-skinny-yellow/[0.08] border border-skinny-yellow/30 text-white'
          : 'bg-white/[0.03] border border-white/[0.05] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.1]',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md',
          active
            ? 'bg-skinny-yellow/20 text-skinny-yellow'
            : 'bg-white/[0.04] text-zinc-300 group-hover:bg-white/[0.07]',
        )}
      >
        <Icon size={13} strokeWidth={2} />
      </span>
      <div className="text-left mt-0.5">
        <div className={cn('text-[12.5px] font-semibold leading-tight', active && 'text-skinny-yellow')}>
          {label}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</div>
      </div>
      {active && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-skinny-yellow" />
      )}
    </button>
  )
}
