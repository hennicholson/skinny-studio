'use client'

// Route-level error boundary for /canvas/*. Rendered when a server / data
// fetch error escapes a Server Component or an unhandled Client Component
// error bubbles up. Keeps the same dark + lime visual language as the rest
// of the canvas surface so it doesn't feel like a different app.

import { useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertOctagon, RefreshCw, ChevronLeft } from 'lucide-react'

export default function CanvasError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface server-side error digests in the console for support triage.
    // Don't log full error to avoid leaking stack traces in prod.
    if (error.digest) console.error('[canvas:error]', error.digest)
  }, [error])

  return (
    <main className="h-[100dvh] bg-black text-white flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md rounded-2xl bg-white/[0.03] border border-white/[0.06] p-7 text-center"
      >
        <div className="mx-auto mb-5 w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <AlertOctagon size={18} className="text-red-300" />
        </div>
        <h1 className="font-display uppercase tracking-tight text-2xl text-zinc-50 mb-2">
          Something broke
        </h1>
        <p className="text-xs text-zinc-500 leading-relaxed mb-1">
          We couldn&apos;t load this part of canvas. Try again — if it keeps
          failing, refresh or head back to the workflows home.
        </p>
        {error.digest && (
          <p className="text-[10px] text-zinc-700 font-mono mt-3 mb-1">
            ref · {error.digest}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => reset()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-skinny-yellow text-black text-xs font-semibold hover:bg-skinny-yellow/90 active:scale-[0.98] transition-all"
          >
            <RefreshCw size={12} />
            Try again
          </button>
          <Link
            href="/canvas"
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 hover:border-white/[0.12] transition-colors"
          >
            <ChevronLeft size={12} />
            Workflows
          </Link>
        </div>
      </motion.div>
    </main>
  )
}
