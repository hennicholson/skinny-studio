'use client'

// Canvas landing — shell-embedded version of the canvas hub. This is the
// "make something" workspace that lives INSIDE app/page.tsx's mode-swap stack
// (alongside Chat, Library, Gallery). The full editor at /canvas/[id] is a
// separate full-bleed React Flow surface and is intentionally left untouched.
//
// Differences from the old standalone /canvas page:
//   - No outer page wrapper claiming `h-[100dvh]` — instead `h-full` so it
//     fills the shell's flex slot. The shell already owns the viewport.
//   - No standalone header — the shell's header (logo / mode-switcher /
//     wallet / settings / avatar) is persistent across all modes.
//   - No AuthGate — the shell mounts auth context once at the root.
//   - EtherealBackground is `absolute inset-0` inside the view (not `fixed`)
//     so it can't bleed onto Chat / Library / Gallery during transitions.
//   - "+ new canvas" CTA pinned to the view container (`absolute bottom-5`)
//     not the viewport — otherwise it would persist when other modes mount.
//   - Body scroll override useEffect dropped — globals.css locks body
//     overflow for the single-viewport design, and the shell hands us a
//     fixed-height slot; native scroll on this view's root is sufficient.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SkinnyLogo } from '@/components/ui/SkinnyLogo'
import { CanvasIntroSplash } from '@/components/ui/CanvasIntroSplash'
import { SkinnyLottie } from '@/components/ui/SkinnyLottie'
import { CanvasMiniGraph } from './CanvasMiniGraph'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus,
  Wallet,
  Sparkles,
  ArrowUpRight,
  Layers,
  Pencil,
  Trash2,
  ExternalLink,
  Shield,
  AlertTriangle,
  Image as ImageIcon,
  Film,
  Grid3x3,
  Wand2,
  FilePlus,
} from 'lucide-react'
import { Canvas } from '@/lib/canvas/ir'
import { CanvasTemplate } from '@/lib/canvas/templates'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'
import { useUser } from '@/lib/context/user-context'
import { WhatsNewSheet } from '@/components/whats-new/WhatsNewSheet'
import { EtherealBackground } from '@/components/ui/ethereal-background'
import { isAdmin } from '@/lib/admin'
import { toast } from 'sonner'

// Balance under $1 surfaces a soft top-up nudge in the wallet pill.
const LOW_BALANCE_THRESHOLD_CENTS = 100

// Shared entrance curve — same easing the chat empty-state uses so a chat → canvas
// mode swap feels like one continuous app, not two surfaces stitched together.
const viewTransition = { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const }

type IconType = typeof ImageIcon

interface Template {
  key: CanvasTemplate
  title: string
  hint: string
  icon: IconType
}

// Lowercase + brief to match the chat voice. Sentence-case chip labels.
const TEMPLATES: Template[] = [
  { key: 'image',          title: 'single image',     hint: 'prompt to image',                icon: ImageIcon },
  { key: 'video',          title: 'single video',     hint: 'prompt to video',                icon: Film },
  { key: 'variations',     title: '4 variations',     hint: 'prompt, image, fan-out, output', icon: Grid3x3 },
  { key: 'image-to-video', title: 'image to motion',  hint: 'reference image to video',       icon: Wand2 },
  { key: 'blank',          title: 'blank canvas',     hint: 'start from scratch',             icon: FilePlus },
]

function titleForTemplate(t: Template): string | undefined {
  return t.key === 'blank' ? undefined : t.title
}

export function CanvasLandingView() {
  const router = useRouter()
  const getHeaders = useWhopHeaders()
  const { whop, profile, balanceCents, balanceDollars, isLoading: userLoading } = useUser()
  const lifetime = !!profile?.lifetime_access
  const admin = isAdmin(whop?.id)
  const lowBalance = !lifetime && !userLoading && balanceCents < LOW_BALANCE_THRESHOLD_CENTS
  const [canvases, setCanvases] = useState<Canvas[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<CanvasTemplate | null>(null)

  useEffect(() => {
    fetch('/api/canvas?withPreviews=1', { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => setCanvases(d.canvases || []))
      .catch(() => toast.error('Could not load canvases'))
      .finally(() => setLoading(false))
  }, [getHeaders])

  // Optimistic delete — drops the card immediately, rolls back on rejection.
  const handleDelete = useCallback(
    async (id: string) => {
      const prev = canvases
      setCanvases((cs) => cs.filter((c) => c.id !== id))
      try {
        const res = await fetch(`/api/canvas/${id}`, {
          method: 'DELETE',
          headers: getHeaders(),
        })
        if (!res.ok) throw new Error(`${res.status}`)
        toast.success('Canvas deleted')
      } catch (err) {
        setCanvases(prev)
        toast.error('Could not delete canvas')
      }
    },
    [canvases, getHeaders],
  )

  // Rename — fetches latest for optimistic-locking version, then writes back.
  const handleRename = useCallback(
    async (id: string, nextTitle: string) => {
      const trimmed = nextTitle.trim()
      if (!trimmed) return
      const prev = canvases
      setCanvases((cs) => cs.map((c) => (c.id === id ? { ...c, title: trimmed } : c)))
      try {
        const getRes = await fetch(`/api/canvas/${id}`, { headers: getHeaders() })
        const getJson = await getRes.json()
        if (!getRes.ok || !getJson?.canvas) throw new Error('fetch failed')
        const updated: Canvas = { ...getJson.canvas, title: trimmed }
        const putRes = await fetch(`/api/canvas/${id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            canvas: updated,
            expectedVersion: getJson.version,
            sessionId: getJson.lastEditedBySession ?? null,
          }),
        })
        if (!putRes.ok) throw new Error(`${putRes.status}`)
        toast.success('Renamed')
      } catch {
        setCanvases(prev)
        toast.error('Could not rename canvas')
      }
    },
    [canvases, getHeaders],
  )

  // Error matrix for create — see original /canvas/page.tsx for full rationale.
  // 200 → push to editor. 401/403/404/4xx → toast and stay. 5xx + missing-table
  // marker → fall back to /canvas/demo. Other 5xx + network → toast (no silent
  // demo fallback that would mask real failures).
  async function create(template: CanvasTemplate, title?: string) {
    setCreating(template)
    try {
      const res = await fetch('/api/canvas', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ title, template }),
      })

      let rawBody = ''
      try {
        rawBody = await res.clone().text()
      } catch {
        // ignore
      }
      const data = await res.json().catch(() => ({} as any))

      if (res.ok && data?.canvas?.id) {
        router.push(`/canvas/${data.canvas.id}`)
        return
      }

      if (res.status === 401) {
        toast.error('Please sign in to create a canvas')
        return
      }
      if (res.status === 403) {
        toast.error(data?.error || 'No access to create a canvas')
        return
      }
      if (res.status === 404) {
        toast.error('Endpoint not found — please refresh')
        return
      }

      if (res.status >= 500) {
        const combined = `${rawBody}\n${data?.error || ''}\n${data?.detail || ''}`
        const dbNotLinked =
          /relation .* does not exist/i.test(combined) ||
          /Could not find the table/i.test(combined)

        if (dbNotLinked) {
          toast.message('Canvases DB not linked yet — opening in local mode')
          router.push(`/canvas/demo?template=${encodeURIComponent(template)}`)
          return
        }
        toast.error(data?.error || `Could not create canvas (${res.status})`)
        return
      }

      toast.error(data?.error || `Could not create canvas (${res.status})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Could not reach server: ${msg}`)
    } finally {
      setCreating(null)
    }
  }

  return (
    // h-full fills the shell's flex slot (the shell owns the viewport).
    // overflow-y-auto for internal scroll since globals.css locks body scroll.
    // relative so the EtherealBackground + floating CTA anchor to this view.
    <div className="relative h-full w-full overflow-y-auto overflow-x-hidden bg-black text-white">
      {/* Ethereal lime sphere — absolute (not fixed) so it stays inside the
          view container and doesn't bleed onto Chat/Library/Gallery during
          AnimatePresence cross-fades. */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <EtherealBackground
          color="rgba(214, 252, 81, 0.08)"
          scale={50}
          speed={20}
        />
      </div>

      {/* What's New — auto-opens once per RELEASE_VERSION. Self-gates. */}
      <WhatsNewSheet />

      {/* "Introducing Skinny CANVAS" intro Lottie — first visit only. Marks
          itself seen in localStorage; bump INTRO_RELEASE_KEY in the component
          to re-fire on a future launch moment. */}
      <CanvasIntroSplash />

      {/* === Workspace =================================================== */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-40">
        {/* Local sub-header — admin / lifetime / low-balance pills that are
            canvas-landing-specific. The shell's main header already shows the
            user avatar + wallet balance, so we only surface the contextual
            extras here (and only on this view). */}
        {(admin || lifetime || lowBalance) && (
          <div className="flex items-center justify-end gap-1.5 pt-4">
            {admin && (
              <Link
                href="/admin"
                className="hidden sm:inline-flex items-center h-7 px-2 gap-1.5 rounded-full bg-skinny-yellow/[0.08] border border-skinny-yellow/30 text-skinny-yellow text-[10px] font-semibold uppercase tracking-wider hover:bg-skinny-yellow/15 transition-colors"
                title="Open admin tools"
                aria-label="Admin tools"
              >
                <Shield size={11} />
                <span>Admin</span>
              </Link>
            )}

            {!userLoading && lifetime && (
              <div
                title="Lifetime access — generations are on the house"
                className="hidden sm:flex items-center h-7 px-2 gap-1.5 rounded-full bg-skinny-yellow/10 border border-skinny-yellow/30 text-skinny-yellow text-[10px] font-semibold uppercase tracking-wider"
              >
                <Sparkles size={11} className="text-skinny-yellow" />
                <span>Lifetime</span>
              </div>
            )}

            {!userLoading && lowBalance && (
              <Link
                href="/whop/topup"
                title="Balance is low — tap to top up"
                className="flex items-center h-7 px-2 gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/15 transition-colors"
              >
                <AlertTriangle size={11} />
                <span className="font-mono">${balanceDollars}</span>
                <span className="hidden md:inline text-[10px] uppercase tracking-wider">Top up</span>
              </Link>
            )}
          </div>
        )}

        {/* Welcome — SKINNY logo above the headline, lime drop-shadow + float. */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={viewTransition}
          className="pt-4 sm:pt-10 lg:pt-12 pb-8 text-center"
        >
          <div className="flex justify-center mb-4 animate-float">
            <SkinnyLogo
              mode="hero"
              className="w-64 sm:w-80 lg:w-96 drop-shadow-[0_0_60px_rgba(214,252,81,0.5)]"
            />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium text-white tracking-tight animate-slideUp">
            make something
          </h1>
          <div className="mx-auto h-px w-28 sm:w-32 bg-gradient-to-r from-transparent via-skinny-yellow/40 to-transparent mt-3 animate-expandWidth" />
          <p className="mt-4 text-sm sm:text-base text-white/45 max-w-md mx-auto animate-slideUp animation-delay-100">
            pick a starter, or open something you were working on
          </p>
        </motion.section>

        {/* === Suggestion chips (templates) ============================= */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...viewTransition, delay: 0.05 }}
          aria-label="Start a new canvas"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {TEMPLATES.map((t, i) => (
              <TemplateChip
                key={t.key}
                template={t}
                index={i}
                busy={!!creating}
                loading={creating === t.key}
                onClick={() => create(t.key, titleForTemplate(t))}
              />
            ))}
          </div>
        </motion.section>

        {/* === Recent canvases rail ==================================== */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...viewTransition, delay: 0.1 }}
          className="mt-10 sm:mt-14"
          aria-label="Recent canvases"
        >
          <div className="flex items-baseline justify-between mb-3 px-0.5">
            <h3 className="text-xs font-medium text-white/50">pick up where you left off</h3>
            {canvases.length > 0 && (
              <span className="text-[10px] text-white/30 font-mono">
                {canvases.length} {canvases.length === 1 ? 'canvas' : 'canvases'}
              </span>
            )}
          </div>

          {loading ? (
            <RecentSkeletons />
          ) : canvases.length === 0 ? (
            <EmptyRecent />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              <AnimatePresence>
                {canvases.map((c, i) => (
                  <RecentCard
                    key={c.id}
                    canvas={c}
                    index={i}
                    onDelete={handleDelete}
                    onRename={handleRename}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.section>
      </div>

      {/* === Floating primary CTA ====================================== */}
      {/* `absolute` (not `fixed`) so it anchors to this view container — once
          the user switches to Chat / Library / Gallery, this CTA goes with
          the view it belongs to instead of persisting over other modes. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...viewTransition, delay: 0.15 }}
        className="absolute bottom-5 left-0 right-0 z-30 px-4 flex justify-center pointer-events-none"
      >
        <button
          onClick={() => create('blank')}
          disabled={!!creating}
          className="pointer-events-auto inline-flex items-center gap-2 h-11 pl-4 pr-5 rounded-full bg-skinny-yellow text-black text-sm font-medium shadow-[0_8px_32px_rgba(214,252,81,0.25)] hover:shadow-[0_12px_40px_rgba(214,252,81,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-[transform,box-shadow] duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label="Create a new blank canvas"
        >
          <Plus size={16} strokeWidth={2.4} />
          <span>new canvas</span>
        </button>
      </motion.div>
    </div>
  )
}

/* =========================================================================
 * Template chip — glass card with icon + title + hint.
 * ======================================================================= */
function TemplateChip({
  template,
  index,
  busy,
  loading,
  onClick,
}: {
  template: Template
  index: number
  busy: boolean
  loading: boolean
  onClick: () => void
}) {
  const Icon = template.icon
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.04, ...viewTransition }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={busy}
      className="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.1] text-left transition-[background-color,border-color] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/40 focus-visible:border-skinny-yellow/40"
      aria-label={`create ${template.title} canvas`}
    >
      <span className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.05] flex items-center justify-center text-white/40 group-hover:text-skinny-yellow group-hover:border-skinny-yellow/30 transition-colors">
        <Icon size={16} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white/90 group-hover:text-white transition-colors truncate">
          {template.title}
        </div>
        <div className="text-[11px] text-white/40 truncate">{template.hint}</div>
      </div>

      <span className="shrink-0 w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.05] flex items-center justify-center text-white/30 group-hover:text-skinny-yellow group-hover:border-skinny-yellow/30 transition-colors">
        {loading ? (
          <span className="w-2 h-2 rounded-full bg-skinny-yellow animate-pulse" />
        ) : (
          <ArrowUpRight size={12} />
        )}
      </span>
    </motion.button>
  )
}

/* =========================================================================
 * Recent card — compact glass row with right-click context menu.
 * Clicking the card routes to /canvas/[id] (full editor). The editor is a
 * full-bleed React Flow surface that intentionally leaves the shell behind.
 * ======================================================================= */
function RecentCard({
  canvas,
  index,
  onDelete,
  onRename,
}: {
  canvas: Canvas
  index: number
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const nodeCount = (canvas.nodes || []).length
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menu) return
    const onDocClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    const onScroll = () => setMenu(null)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu])

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = cardRef.current?.getBoundingClientRect()
    const localX = rect ? Math.min(e.clientX - rect.left, rect.width - 180) : 0
    const localY = rect ? e.clientY - rect.top : 0
    setMenu({ x: Math.max(8, localX), y: localY })
  }

  const handleRenamePrompt = () => {
    setMenu(null)
    const next = window.prompt('Rename canvas', canvas.title || 'Untitled')
    if (next != null && next.trim() && next.trim() !== (canvas.title || '')) {
      onRename(canvas.id, next.trim())
    }
  }

  const handleDeleteConfirm = () => {
    setMenu(null)
    const ok = window.confirm(
      `Delete "${canvas.title || 'Untitled'}"? This can't be undone.`,
    )
    if (ok) onDelete(canvas.id)
  }

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 * index, ...viewTransition }}
      whileHover={{ y: -2 }}
      onContextMenu={onContextMenu}
      className="relative"
    >
      <Link
        href={`/canvas/${canvas.id}`}
        className="group block p-2 rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.1] transition-[background-color,border-color] focus-visible:outline-none focus-visible:border-skinny-yellow/40 focus-visible:ring-2 focus-visible:ring-skinny-yellow/20"
        aria-label={`Open canvas: ${canvas.title || 'Untitled'}`}
      >
        {/* Live preview — SVG mini-graph of node positions + edges, tinted
            by the most recent generation output if any. Same auto-layout
            algorithm the Director uses, so the preview reads as "this is
            the shape of the workflow inside" at a glance. */}
        <div className="mb-2 rounded-lg overflow-hidden">
          <CanvasMiniGraph
            nodes={canvas.nodes || []}
            edges={canvas.edges || []}
            height={88}
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-3 px-1.5 pb-1.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium text-white/90 group-hover:text-white transition-colors truncate">
              {canvas.title || 'Untitled'}
            </h4>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
              <span>
                {canvas.updatedAt ? relativeTime(new Date(canvas.updatedAt)) : '—'}
              </span>
              {nodeCount > 0 && (
                <>
                  <span className="text-white/15">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Layers size={9} className="text-white/30" />
                    <span className="font-mono">{nodeCount}</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <span className="shrink-0 w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.05] flex items-center justify-center text-white/30 group-hover:text-skinny-yellow group-hover:border-skinny-yellow/30 transition-colors">
            <ArrowUpRight size={12} />
          </span>
        </div>
      </Link>

      {menu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
          role="menu"
          aria-label="Canvas actions"
          className="absolute z-30 w-44 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-white/[0.08] shadow-2xl overflow-hidden py-1"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/canvas/${canvas.id}`}
            role="menuitem"
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.05] transition-colors"
            onClick={() => setMenu(null)}
          >
            <ExternalLink size={12} className="text-zinc-500" />
            Open
          </Link>
          <button
            role="menuitem"
            onClick={handleRenamePrompt}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.05] transition-colors"
          >
            <Pencil size={12} className="text-zinc-500" />
            Rename
          </button>
          <div className="h-px bg-white/[0.06] my-1" />
          <button
            role="menuitem"
            onClick={handleDeleteConfirm}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}

function RecentSkeletons() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden relative flex flex-col"
          aria-hidden
        >
          {/* Mini-graph slot — Lottie pulse loop in skinny lime, signaling
              the preview is being computed. Matches the height of the real
              CanvasMiniGraph so loaded cards don't jump in height. */}
          <div className="flex items-center justify-center h-[88px] bg-white/[0.02]">
            <SkinnyLottie variant="orbit" className="w-12 opacity-70" ariaLabel="Loading canvas previews" />
          </div>
          {/* Title + meta skeleton — staggered shimmer so it reads as a
              cascade rather than a synchronous flash. */}
          <div
            className="relative h-[44px] px-3 py-2 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        </div>
      ))}
    </div>
  )
}

function EmptyRecent() {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-dashed border-white/[0.06] py-10 px-4 text-center">
      <div className="flex justify-center mb-3">
        <SkinnyLottie variant="drip" className="w-16 opacity-60" ariaLabel="No canvases yet" />
      </div>
      <p className="text-xs text-white/50">
        no canvases yet — pick a starter above to make your first
      </p>
    </div>
  )
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}
