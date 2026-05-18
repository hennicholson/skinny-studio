'use client'

// Auto-opens once per RELEASE_VERSION (tracked in
// user_profiles.last_seen_release_version). Dismissing marks the version
// seen; the sheet won't reopen until the version is bumped.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Sparkles } from 'lucide-react'
import { RELEASE_VERSION, getEntryForVersion } from '@/lib/release-version'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'

export function WhatsNewSheet() {
  const getHeaders = useWhopHeaders()
  const [open, setOpen] = useState(false)
  const entry = getEntryForVersion(RELEASE_VERSION)

  useEffect(() => {
    let cancelled = false
    fetch('/api/users/whats-new', { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.seen) setOpen(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [getHeaders])

  async function dismiss() {
    setOpen(false)
    try {
      await fetch('/api/users/whats-new', { method: 'POST', headers: getHeaders() })
    } catch {
      // Non-fatal. We can re-show later if it didn't save.
    }
  }

  if (!entry) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-white/[0.08] shadow-2xl overflow-hidden"
          >
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X size={12} className="text-zinc-400" />
            </button>

            {entry.hero?.kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.hero.src} alt="" className="w-full aspect-video object-cover" />
            )}
            {entry.hero?.kind === 'video' && (
              <video src={entry.hero.src} className="w-full aspect-video object-cover" muted loop autoPlay playsInline />
            )}

            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-skinny-yellow/15 border border-skinny-yellow/40 flex items-center justify-center">
                  <Sparkles size={12} className="text-skinny-yellow" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-skinny-yellow">What's new</span>
              </div>
              <h2 className="text-lg font-semibold text-white mb-1.5">{entry.title}</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">{entry.body}</p>

              <div className="mt-5 flex gap-2">
                {entry.cta && (
                  <Link
                    href={entry.cta.href}
                    onClick={dismiss}
                    className="flex-1 text-center px-3 py-2 rounded-md bg-skinny-yellow/15 border border-skinny-yellow/40 hover:bg-skinny-yellow/25 text-xs font-semibold text-skinny-yellow transition-colors"
                  >
                    {entry.cta.label}
                  </Link>
                )}
                <button
                  onClick={dismiss}
                  className="flex-1 px-3 py-2 rounded-md bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] text-xs text-zinc-400 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
