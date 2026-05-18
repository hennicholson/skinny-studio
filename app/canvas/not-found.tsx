// Route-level 404 for /canvas/*. Visual language matches the workflows
// landing so a missing canvas ID lands on a page that still feels like
// part of the app, not a generic Next default.

import Link from 'next/link'
import { ChevronLeft, Compass } from 'lucide-react'

export default function CanvasNotFound() {
  return (
    <main className="h-[100dvh] bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl bg-white/[0.03] border border-white/[0.06] p-7 text-center">
        <div className="mx-auto mb-5 w-11 h-11 rounded-xl bg-skinny-yellow/10 border border-skinny-yellow/30 flex items-center justify-center">
          <Compass size={18} className="text-skinny-yellow" />
        </div>
        <h1 className="font-display uppercase tracking-tight text-2xl text-zinc-50 mb-2">
          Canvas not found
        </h1>
        <p className="text-xs text-zinc-500 leading-relaxed">
          This canvas might have been deleted or it never existed. Start a new
          one from the workflows page.
        </p>

        <Link
          href="/canvas"
          className="mt-5 inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg bg-skinny-yellow text-black text-xs font-semibold hover:bg-skinny-yellow/90 active:scale-[0.98] transition-all"
        >
          <ChevronLeft size={12} />
          Back to workflows
        </Link>
      </div>
    </main>
  )
}
