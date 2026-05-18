'use client'

// Root error boundary. Rendered when an error escapes a Server Component
// render or an unhandled Client Component error bubbles up to the root.
// Matches the visual language of the canvas error boundary so users feel
// like they're still inside Skinny Studio, not a generic Next page.
//
// Notes:
// - Never expose `error.message` / stack — production users see only the
//   digest (a hash safe to share with support) and a friendly explanation.
// - Layout uses `100dvh` so the safe-area on iOS doesn't clip the card.
// - Reset button calls Next's `reset()` to retry rendering; Reload does
//   a hard reload as the escape hatch when reset alone doesn't recover.

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertOctagon, RefreshCw, RotateCw, LifeBuoy } from 'lucide-react'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface server-side digests for support triage. Don't log the full
    // error in prod to avoid leaking stack traces / source paths.
    if (error.digest) console.error('[skinny-studio:error]', error.digest)
  }, [error])

  return (
    <main className="min-h-[100dvh] bg-black text-white flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.06] p-7 text-center"
      >
        <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <AlertOctagon size={20} className="text-red-300" aria-hidden />
        </div>
        <h1 className="font-display uppercase tracking-tight text-2xl text-zinc-50 mb-2">
          Something broke
        </h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          We hit an unexpected error. Try again — if it keeps happening, reload
          the page or reach out and we&apos;ll dig in.
        </p>
        {error.digest && (
          <p className="text-[10px] text-zinc-600 font-mono mt-3">
            ref · {error.digest}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg bg-skinny-yellow text-black text-xs font-semibold hover:bg-skinny-green active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
          >
            <RefreshCw size={12} aria-hidden />
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload()
            }}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-zinc-200 hover:bg-white/[0.08] active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
          >
            <RotateCw size={12} aria-hidden />
            Reload
          </button>
        </div>

        <a
          href="https://whop.com/skinny-studio/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <LifeBuoy size={11} aria-hidden />
          Contact support
        </a>
      </motion.div>
    </main>
  )
}
