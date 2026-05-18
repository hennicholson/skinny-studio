'use client'

// Visual-preview of the workflows index page WITHOUT the AuthGate, used
// to verify the design without signing in. Mounts the same content with
// mocked auth state + a few fake recent canvases so the layout reads.
// Do not link from production navigation.
//
// Kept visually in sync with app/canvas/page.tsx — same drop-page atmosphere,
// same SKINNY STUDIO wordmark hero, same soft-glass cards.

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus,
  ChevronLeft,
  Wallet,
  User as UserIcon,
  Sparkles,
  ArrowUpRight,
  Layers,
} from 'lucide-react'
import { Canvas } from '@/lib/canvas/ir'

// Re-render the same building blocks from the real page. We can't easily
// import them since they're internal to page.tsx, so we duplicate the
// minimum needed surface (templates + cards). This file is preview-only.

type Illustration = 'image' | 'video' | 'variations' | 'animated' | 'blank'
interface Template {
  key: string
  title: string
  hint: string
  illustration: Illustration
}

const TEMPLATES: Template[] = [
  { key: 'image',          title: 'Single image',     hint: 'Prompt → Image Model → Output',          illustration: 'image' },
  { key: 'video',          title: 'Single video',     hint: 'Prompt → Video Model → Output',          illustration: 'video' },
  { key: 'variations',     title: '4 variations',     hint: 'Prompt → Image → Fan-out → Output',      illustration: 'variations' },
  { key: 'image-to-video', title: 'Image → animated', hint: 'Reference + Prompt → Video → Output',    illustration: 'animated' },
  { key: 'blank',          title: 'Blank canvas',     hint: 'Start from scratch',                     illustration: 'blank' },
]

const MOCK_RECENT: Pick<Canvas, 'id' | 'title' | 'updatedAt' | 'nodes'>[] = [
  { id: 'a', title: 'Cinematic athlete portraits', updatedAt: new Date(Date.now() - 60_000 * 12).toISOString(), nodes: new Array(7).fill(null) as any },
  { id: 'b', title: 'Brand reels — Q2', updatedAt: new Date(Date.now() - 60_000 * 60 * 3).toISOString(), nodes: new Array(11).fill(null) as any },
  { id: 'c', title: 'Untitled', updatedAt: new Date(Date.now() - 60_000 * 60 * 24 * 2).toISOString(), nodes: new Array(3).fill(null) as any },
]

export default function CanvasIndexPreview() {
  const [creating, setCreating] = useState<string | null>(null)
  const username = 'preview'
  const balanceDollars = '12.40'

  return (
    <main className="relative h-[100dvh] bg-black text-white overflow-y-auto">
      <BackgroundAtmosphere />

      <header className="sticky top-0 z-20 bg-black/70 backdrop-blur-md border-b border-white/[0.05]">
        <div className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center gap-3">
          <Link href="/" className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/[0.05] transition-colors">
            <ChevronLeft size={16} className="text-zinc-400" />
          </Link>
          <Link href="/" className="flex items-center h-8 px-1 hover:opacity-90 transition-opacity">
            <Image src="/skinny-logo.svg" alt="Skinny Studio" width={72} height={21} className="h-3.5 w-auto" priority />
          </Link>
          <span className="hidden sm:block h-4 w-px bg-white/[0.08]" />
          <h1 className="text-sm font-medium text-zinc-200">Canvases · Preview</h1>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="hidden sm:flex items-center h-8 px-2.5 gap-1.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-zinc-300 text-xs">
              <UserIcon size={11} className="text-zinc-500" />
              <span className="font-medium truncate max-w-[120px]">{username}</span>
            </div>
            <div className="flex items-center h-8 px-2.5 gap-1.5 rounded-full bg-skinny-yellow/10 border border-skinny-yellow/30 text-skinny-yellow text-[10px] font-semibold uppercase tracking-wider">
              <Sparkles size={11} />
              <span>Lifetime</span>
            </div>
            <div className="flex items-center h-8 px-2.5 gap-1.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-zinc-300 text-xs">
              <Wallet size={11} className="text-skinny-yellow" />
              <span className="font-mono">${balanceDollars}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero — empty-state styled SKINNY STUDIO wordmark + workflow chip */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center text-center"
        >
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white font-display uppercase tracking-tight"
          >
            SKINNY STUDIO
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-skinny-yellow" />
            <span className="text-[10px] uppercase tracking-[0.32em] text-skinny-yellow font-semibold">
              Workflows
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 font-display uppercase tracking-tight text-zinc-50 text-5xl sm:text-7xl lg:text-[104px] leading-[0.92]"
          >
            Compose,
            <br />
            wire, and run.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-7 text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed"
          >
            Drag models onto a canvas. Pipe prompts to images to video. Hit Run to send the whole graph through Skinny's generation engine.
          </motion.p>
        </motion.div>
      </section>

      {/* Templates */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="flex items-baseline justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-white/[0.08]" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Start a workflow</h3>
          </div>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Pick a starter or go blank</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
          {TEMPLATES.map((t, i) => (
            <TemplateCard key={t.key} template={t} index={i} busy={!!creating} loading={creating === t.key} onClick={() => setCreating(t.key)} />
          ))}
        </div>
      </section>

      {/* Recent */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="flex items-baseline justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-white/[0.08]" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Recent</h3>
          </div>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono">{MOCK_RECENT.length} canvases</span>
        </div>
        <AnimatePresence>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MOCK_RECENT.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i }} whileHover={{ y: -2 }}>
                <Link href="#" className="group block p-5 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] hover:border-skinny-yellow/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-display uppercase tracking-tight text-zinc-50 text-base truncate">{c.title}</h4>
                      <p className="mt-1 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Edited {relTime(new Date(c.updatedAt!))}</p>
                    </div>
                    <div className="shrink-0 w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-500 group-hover:bg-skinny-yellow group-hover:text-zinc-900 group-hover:border-skinny-yellow transition-colors">
                      <ArrowUpRight size={13} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <Layers size={10} className="text-zinc-600" />
                    <span className="font-mono">{c.nodes.length} nodes</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </section>
    </main>
  )
}

/* ===== shared visual bits — kept in sync with app/canvas/page.tsx ===== */

// Single animated lime/yellow sphere — ported from empty-state.tsx with the
// exact same 8s opacity 0.2→0.4→0.2 + scale 1→1.1→1 keyframes.
function BackgroundAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: [0.2, 0.4, 0.2],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="w-[500px] h-[500px] sm:w-[800px] sm:h-[800px] lg:w-[1000px] lg:h-[1000px] rounded-full bg-gradient-to-br from-skinny-yellow/10 via-skinny-green/10 to-lime-500/5 blur-3xl"
        />
      </div>
    </div>
  )
}

function TemplateCard({ template, index, busy, loading, onClick }: { template: Template; index: number; busy: boolean; loading: boolean; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.08, duration: 0.4 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={busy}
      className="group relative text-left rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] hover:border-skinny-yellow/20 hover:shadow-[0_0_40px_rgba(214,252,81,0.08)] overflow-hidden transition-[box-shadow,background-color,border-color] disabled:opacity-50"
    >
      <div className="relative h-32 sm:h-36 w-full overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '12px 12px' }}
        />
        <TemplateIllustration kind={template.illustration} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-[0.22em] text-skinny-yellow animate-pulse">Creating…</span>
          </div>
        )}
        <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-500 group-hover:bg-skinny-yellow group-hover:text-zinc-900 group-hover:border-skinny-yellow transition-colors">
          <ArrowUpRight size={13} />
        </div>
      </div>
      <div className="relative p-4 sm:p-5 border-t border-white/[0.04]">
        <h4 className="font-display uppercase tracking-tight text-zinc-50 text-lg sm:text-xl leading-tight group-hover:text-white transition-colors">{template.title}</h4>
        <p className="mt-1.5 text-[11px] sm:text-xs text-zinc-500 leading-relaxed font-mono group-hover:text-zinc-400 transition-colors">{template.hint}</p>
      </div>
    </motion.button>
  )
}

function TemplateIllustration({ kind }: { kind: Illustration }) {
  if (kind === 'image') {
    return (
      <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full">
        <Path d="M 38 50 Q 70 50 80 50" color="#10b981" />
        <Path d="M 122 50 Q 152 50 162 50" color="#38bdf8" />
        <Node x={20} y={50} w={18} h={12} color="#10b981" label="P" />
        <Node x={80} y={50} w={40} h={28} color="#38bdf8" filled />
        <Node x={162} y={50} w={18} h={12} color="#f5f5f5" label="↗" outline />
      </svg>
    )
  }
  if (kind === 'video') {
    return (
      <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full">
        <Path d="M 38 50 Q 70 50 80 50" color="#10b981" />
        <Path d="M 122 50 Q 152 50 162 50" color="#f43f5e" />
        <Node x={20} y={50} w={18} h={12} color="#10b981" label="P" />
        <Node x={80} y={50} w={40} h={28} color="#f43f5e" filled video />
        <Node x={162} y={50} w={18} h={12} color="#f5f5f5" label="↗" outline />
      </svg>
    )
  }
  if (kind === 'variations') {
    return (
      <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full">
        <Path d="M 38 50 Q 60 50 68 50" color="#10b981" />
        <Path d="M 92 50 Q 110 50 118 50" color="#38bdf8" />
        <Path d="M 132 50 Q 148 28 158 22" color="#38bdf8" />
        <Path d="M 132 50 Q 148 42 158 40" color="#38bdf8" />
        <Path d="M 132 50 Q 148 58 158 60" color="#38bdf8" />
        <Path d="M 132 50 Q 148 72 158 78" color="#38bdf8" />
        <Node x={20} y={50} w={18} h={12} color="#10b981" label="P" />
        <Node x={68} y={50} w={24} h={20} color="#38bdf8" filled />
        <Node x={118} y={50} w={14} h={10} color="#a78bfa" label="∞" />
        <Node x={166} y={22} w={14} h={10} color="#38bdf8" filled />
        <Node x={166} y={40} w={14} h={10} color="#38bdf8" filled />
        <Node x={166} y={60} w={14} h={10} color="#38bdf8" filled />
        <Node x={166} y={78} w={14} h={10} color="#38bdf8" filled />
      </svg>
    )
  }
  if (kind === 'animated') {
    return (
      <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full">
        <Path d="M 42 32 Q 70 32 78 40" color="#38bdf8" />
        <Path d="M 38 70 Q 70 70 78 60" color="#10b981" />
        <Path d="M 122 50 Q 152 50 162 50" color="#f43f5e" />
        <Node x={22} y={32} w={20} h={16} color="#38bdf8" filled />
        <Node x={20} y={70} w={18} h={12} color="#10b981" label="P" />
        <Node x={80} y={50} w={40} h={28} color="#f43f5e" filled video />
        <Node x={162} y={50} w={18} h={12} color="#f5f5f5" label="↗" outline />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full">
      <defs>
        <pattern id="dots-blank-preview" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="rgba(255,255,255,0.18)" />
        </pattern>
      </defs>
      <rect x="32" y="22" width="136" height="56" rx="6" fill="url(#dots-blank-preview)" stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4" />
      <g transform="translate(100 50)">
        <line x1="-7" x2="7" y1="0" y2="0" stroke="#D6FC51" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="0" x2="0" y1="-7" y2="7" stroke="#D6FC51" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  )
}

function Path({ d, color }: { d: string; color: string }) {
  return <path d={d} stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.85" />
}

function Node({ x, y, w, h, color, filled, label, outline, video }: { x: number; y: number; w: number; h: number; color: string; filled?: boolean; label?: string; outline?: boolean; video?: boolean }) {
  const left = x - w / 2
  const top = y - h / 2
  return (
    <g>
      <rect x={left} y={top} width={w} height={h} rx={3} fill={filled ? color : outline ? 'transparent' : 'rgba(24,24,27,0.95)'} stroke={color} strokeWidth={outline ? 1 : 0.8} opacity={filled ? 0.75 : 1} />
      {video && <polygon points={`${x - 3},${y - 4} ${x - 3},${y + 4} ${x + 4},${y}`} fill="rgba(255,255,255,0.85)" />}
      {label && <text x={x} y={y + 3} fontSize={outline ? 9 : 8} textAnchor="middle" fill={outline ? color : 'rgba(0,0,0,0.85)'} fontFamily="monospace" fontWeight="700">{label}</text>}
    </g>
  )
}

function relTime(d: Date): string {
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
