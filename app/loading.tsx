// Root-level Suspense fallback. Shown while the app shell streams or a
// data fetch in a Server Component is in flight.
//
// We render a centered branded loader rather than a skeleton because
// the root layout could be loading anywhere in the app — without route
// context we can't reliably predict content shape. Specific routes
// (canvas, settings, etc.) own their own skeleton loaders.

export default function RootLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-[100dvh] bg-black text-white flex items-center justify-center px-6"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          {/* Pulsing ring — pure CSS so it works before JS hydrates. */}
          <div className="absolute inset-0 rounded-full border-2 border-skinny-yellow/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-skinny-yellow animate-spin" />
        </div>
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
          Loading
          <span className="sr-only"> Skinny Studio</span>
        </p>
      </div>
    </main>
  )
}
