'use client'

// Welcome state for an empty canvas. Renders ABOVE the dotted background
// but BELOW the chrome (TopBar / LeftRail / BottomToolbar). The owner is
// responsible for mounting this only when `canvas.nodes.length === 0` and
// the user hasn't dismissed it yet — this component is purely presentational.
//
// Quick-pick tiles dispatch a CanvasTemplate to the parent (which calls
// buildTemplate(template) in lib/canvas/templates.ts). The blank link and
// the bottom hint never auto-add nodes; they just teach the user how to.

import { motion, type Variants } from 'framer-motion'
import type { CanvasTemplate } from '@/lib/canvas/templates'

interface EmptyCanvasOverlayProps {
  onPickTemplate: (template: CanvasTemplate) => void
  onStartBlank: () => void
  onOpenPalette: () => void
}

interface TileDef {
  id: Exclude<CanvasTemplate, 'blank'>
  title: string
  subtitle: string
  preview: () => React.ReactElement
}

const TILES: TileDef[] = [
  {
    id: 'image',
    title: 'Image',
    subtitle: 'Prompt → Image model',
    preview: () => <ImagePreview />,
  },
  {
    id: 'video',
    title: 'Video',
    subtitle: 'Prompt → Video model',
    preview: () => <VideoPreview />,
  },
  {
    id: 'variations',
    title: 'Variations',
    subtitle: 'One prompt, many outputs',
    preview: () => <VariationsPreview />,
  },
  {
    id: 'image-to-video',
    title: 'Image → Animated',
    subtitle: 'Bring a still frame to life',
    preview: () => <ImageToVideoPreview />,
  },
]

export function EmptyCanvasOverlay({
  onPickTemplate,
  onStartBlank,
  onOpenPalette,
}: EmptyCanvasOverlayProps) {
  return (
    <motion.div
      // pointer-events-auto on the inner card so the dotted-bg behind doesn't
      // capture clicks. The outermost wrapper stays interactive so users
      // can right-click anywhere to drop a node (mirrors LeftRail behavior).
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 z-20 flex items-center justify-center px-4 py-10 sm:p-6 overflow-y-auto"
      role="region"
      aria-label="Empty canvas welcome"
    >
      {/* Soft radial vignette so the card lifts off the dotted bg */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 45%, rgba(214,252,81,0.05) 0%, rgba(0,0,0,0) 70%)',
        }}
      />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
        }}
        className="relative w-full max-w-4xl flex flex-col items-center text-center"
      >
        {/* Mark */}
        <motion.div
          variants={fadeUp}
          className="mb-5 flex items-center gap-2 text-zinc-400"
        >
          <SkinnyMark />
          <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-zinc-500">
            Skinny Studio
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          className="font-display text-3xl sm:text-5xl tracking-tight text-white"
        >
          What do you want to make?
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="mt-2 text-sm text-zinc-400 max-w-md"
        >
          Start from a template, or build it from scratch — your canvas is yours.
        </motion.p>

        {/* Tiles */}
        <motion.div
          variants={fadeUp}
          className="mt-8 sm:mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full"
        >
          {TILES.map((tile) => (
            <Tile
              key={tile.id}
              tile={tile}
              onClick={() => onPickTemplate(tile.id)}
            />
          ))}
        </motion.div>

        {/* Secondary actions */}
        <motion.div
          variants={fadeUp}
          className="mt-6 flex flex-col items-center gap-1"
        >
          <button
            type="button"
            onClick={onStartBlank}
            className="text-xs text-zinc-400 hover:text-white transition-colors underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 rounded px-2 py-1"
          >
            Or start from blank
          </button>
        </motion.div>

        {/* Bottom hint */}
        <motion.p
          variants={fadeUp}
          className="mt-8 text-[11px] text-zinc-500 leading-relaxed"
        >
          Right-click anywhere to add a node{' '}
          <span className="text-zinc-700 mx-1">·</span> Press{' '}
          <button
            type="button"
            onClick={onOpenPalette}
            className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.06] ring-1 ring-white/10 text-[10px] font-mono text-zinc-300 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors align-middle"
            aria-label="Open command palette"
          >
            /
          </button>{' '}
          for the palette
        </motion.p>
      </motion.div>
    </motion.div>
  )
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

/* ───────────────────────── Tile ───────────────────────── */

function Tile({
  tile,
  onClick,
}: {
  tile: TileDef
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.015 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="group relative flex flex-col text-left rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06] hover:ring-skinny-yellow/40 hover:bg-white/[0.04] p-3 sm:p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
      aria-label={`Start with ${tile.title} template`}
    >
      {/* preview area */}
      <div className="aspect-[5/3] w-full rounded-lg bg-black/40 ring-1 ring-white/[0.04] overflow-hidden flex items-center justify-center mb-2.5 sm:mb-3">
        <div className="w-full h-full p-3 flex items-center justify-center">
          {tile.preview()}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-white group-hover:text-skinny-yellow transition-colors">
          {tile.title}
        </span>
        <span className="text-[11px] text-zinc-500 leading-snug">
          {tile.subtitle}
        </span>
      </div>

      {/* subtle hover gradient bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background:
            'radial-gradient(80% 50% at 50% 0%, rgba(214,252,81,0.06) 0%, rgba(0,0,0,0) 70%)',
        }}
      />
    </motion.button>
  )
}

/* ───────────────────────── Preview SVGs ─────────────────────────
   Abstract little node-graphs. Stroke colors map roughly to the
   real handle palette so users get a tiny visual cue. */

const STROKE = '#3f3f46'
const STROKE_HOVER = '#52525b'
const PROMPT = '#facc15' // yellow-ish, prompt
const IMAGE = '#60a5fa' // blue-ish, image
const VIDEO = '#a78bfa' // purple-ish, video

function NodeBox({ x, y, fill = '#18181b', stroke = STROKE }: { x: number; y: number; fill?: string; stroke?: string }) {
  return (
    <rect
      x={x}
      y={y}
      width={26}
      height={16}
      rx={3}
      fill={fill}
      stroke={stroke}
      strokeWidth={1}
    />
  )
}

function Wire({ d, stroke }: { d: string; stroke: string }) {
  return <path d={d} stroke={stroke} strokeWidth={1.2} fill="none" strokeLinecap="round" />
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 60"
      className="w-full h-full text-zinc-600 group-hover:text-zinc-400 transition-colors"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function ImagePreview() {
  return (
    <PreviewFrame>
      <Wire d="M30 30 H 50" stroke={PROMPT} />
      <Wire d="M76 30 H 96" stroke={IMAGE} />
      <NodeBox x={4} y={22} />
      <NodeBox x={50} y={22} fill="#1a1a2e" />
      <NodeBox x={96} y={22} />
    </PreviewFrame>
  )
}

function VideoPreview() {
  return (
    <PreviewFrame>
      <Wire d="M30 30 H 50" stroke={PROMPT} />
      <Wire d="M76 30 H 96" stroke={VIDEO} />
      <NodeBox x={4} y={22} />
      <NodeBox x={50} y={22} fill="#1e1a2e" />
      <NodeBox x={96} y={22} />
    </PreviewFrame>
  )
}

function VariationsPreview() {
  return (
    <PreviewFrame>
      <Wire d="M30 30 H 46" stroke={PROMPT} />
      <Wire d="M72 30 H 88" stroke={IMAGE} />
      <Wire d="M101 24 C 108 18, 108 12, 113 10" stroke={IMAGE} />
      <Wire d="M101 30 H 113" stroke={IMAGE} />
      <Wire d="M101 36 C 108 42, 108 48, 113 50" stroke={IMAGE} />
      <NodeBox x={4} y={22} />
      <NodeBox x={46} y={22} fill="#1a1a2e" />
      <NodeBox x={88} y={22} fill="#1a2a2e" />
      <circle cx={115} cy={10} r={2.5} fill="#60a5fa" />
      <circle cx={115} cy={30} r={2.5} fill="#60a5fa" />
      <circle cx={115} cy={50} r={2.5} fill="#60a5fa" />
    </PreviewFrame>
  )
}

function ImageToVideoPreview() {
  return (
    <PreviewFrame>
      <Wire d="M30 18 C 40 18, 40 26, 50 26" stroke={PROMPT} />
      <Wire d="M30 42 C 40 42, 40 34, 50 34" stroke={IMAGE} />
      <Wire d="M76 30 H 96" stroke={VIDEO} />
      <NodeBox x={4} y={10} />
      <NodeBox x={4} y={34} fill="#1a2030" />
      <NodeBox x={50} y={22} fill="#1e1a2e" />
      <NodeBox x={96} y={22} />
    </PreviewFrame>
  )
}

/* ───────────────────────── Skinny Mark ───────────────────────── */

function SkinnyMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      className="text-skinny-yellow"
      aria-hidden
    >
      <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={1.5} fill="none" opacity={0.5} />
      <circle cx={12} cy={12} r={4} fill="currentColor" />
    </svg>
  )
}
