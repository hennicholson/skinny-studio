// Root 404. Catches unknown top-level routes (e.g. typos in URLs that
// got shared). Visual language matches the canvas not-found page so the
// surface still feels like Skinny Studio rather than a Next default.

import Link from 'next/link'
import { ChevronLeft, Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] bg-black text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.06] p-7 text-center">
        <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-skinny-yellow/10 border border-skinny-yellow/30 flex items-center justify-center">
          <Compass size={20} className="text-skinny-yellow" aria-hidden />
        </div>
        <h1 className="font-display uppercase tracking-tight text-2xl text-zinc-50 mb-2">
          Page not found
        </h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          We couldn&apos;t find this page. It might have moved, or the link
          might be off. Head back to the canvas to keep going.
        </p>

        <Link
          href="/canvas"
          className="mt-6 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-lg bg-skinny-yellow text-black text-xs font-semibold hover:bg-skinny-green active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
        >
          <ChevronLeft size={12} aria-hidden />
          Back to canvas
        </Link>
      </div>
    </main>
  )
}
