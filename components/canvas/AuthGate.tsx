// AuthGate — wraps the canvas index + editor pages and renders one of three
// states based on useCanvasAuth():
//   1. loading      → polished skeleton matching the page chrome
//   2. promptLogin  → centered "Sign in with Whop" card with CTA → /whop
//   3. authed       → renders children
//
// Inside the Whop iframe we never show the prompt — the parent frame already
// has the session and the token will arrive via cookie/URL param. We just
// keep the skeleton up until useUser() resolves.
//
// IMPORTANT: This wrapper is intentionally NOT applied to /canvas/demo —
// that route must remain accessible without auth.

'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { LogIn, Sparkles } from 'lucide-react'
import { useCanvasAuth } from '@/lib/hooks/use-canvas-auth'

interface AuthGateProps {
  children: React.ReactNode
  /**
   * Optional override skeleton. If omitted we render a generic canvas-page
   * skeleton (chrome bar + content shimmer).
   */
  skeleton?: React.ReactNode
}

export function AuthGate({ children, skeleton }: AuthGateProps) {
  const { loading, promptLogin } = useCanvasAuth()

  if (loading) {
    return <>{skeleton ?? <DefaultSkeleton />}</>
  }

  if (promptLogin) {
    return <SignInCard />
  }

  return <>{children}</>
}

/* ─────────────────── Sign-in card (standalone dev) ─────────────────── */

function SignInCard() {
  return (
    <main className="h-[100dvh] bg-black text-white flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-sm rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-8 text-center"
      >
        <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-skinny-yellow/10 ring-1 ring-skinny-yellow/20 flex items-center justify-center">
          <Sparkles size={20} className="text-skinny-yellow" />
        </div>
        <Image
          src="/skinny-logo.svg"
          alt="Skinny Studio"
          width={96}
          height={28}
          className="h-4 w-auto mx-auto mb-4 opacity-80"
          priority
        />
        <h1 className="text-base font-semibold text-zinc-100 mb-1.5">
          Sign in with Whop to use canvases
        </h1>
        <p className="text-xs text-zinc-500 leading-relaxed mb-6">
          Canvases require a Whop account so we can credit generations to your
          balance. It only takes a second.
        </p>

        <Link
          href="/whop"
          className="inline-flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-skinny-yellow text-black text-sm font-semibold hover:bg-skinny-yellow/90 active:scale-[0.98] transition-all"
        >
          <LogIn size={14} />
          Sign in with Whop
        </Link>

        <Link
          href="/canvas/demo"
          className="block mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Or preview a demo canvas →
        </Link>
      </motion.div>
    </main>
  )
}

/* ─────────────────── Loading skeleton ─────────────────── */

function DefaultSkeleton() {
  return (
    <main className="h-[100dvh] bg-black text-white overflow-hidden">
      <header className="sticky top-0 z-10 bg-black/85 backdrop-blur-md border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-white/[0.04] animate-pulse" />
          <div className="h-3 w-24 rounded bg-white/[0.04] animate-pulse" />
          <div className="ml-auto flex items-center gap-1.5">
            <div className="h-8 w-24 rounded-md bg-white/[0.03] animate-pulse" />
            <div className="h-8 w-16 rounded-md bg-white/[0.03] animate-pulse" />
          </div>
        </div>
      </header>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-6">
        <div className="h-3 w-20 rounded bg-white/[0.04] animate-pulse mb-2" />
        <div className="h-9 w-2/3 rounded bg-white/[0.04] animate-pulse mb-2" />
        <div className="h-3 w-1/2 rounded bg-white/[0.03] animate-pulse" />
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.04] animate-pulse"
            />
          ))}
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-white/[0.02] ring-1 ring-white/[0.04] animate-pulse"
            />
          ))}
        </div>
      </section>
    </main>
  )
}
