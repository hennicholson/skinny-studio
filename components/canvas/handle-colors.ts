// Single source of truth for handle type → color mapping.
// Pills (visible) and edge strokes (lines) both consult this.
//
// `glow` is a raw rgba string used for box-shadow effects on the handle dot
// (so the snap-zone affordance reads as "this pill belongs to this type")
// without proliferating Tailwind arbitrary values inline.

import { HandleType } from '@/lib/canvas/ir'

export interface HandleColor {
  bg: string       // pill background (Tailwind class, light shade)
  text: string     // pill text (Tailwind class, dark on light bg)
  stroke: string   // edge color (raw hex)
  ring: string     // selected node ring (Tailwind class)
  glow: string     // raw rgba for box-shadow snap-zone glow
  typeLabel: string // human-readable type for tooltips
}

export const HANDLE_COLORS: Record<HandleType, HandleColor> = {
  prompt: { bg: 'bg-emerald-500', text: 'text-emerald-950', stroke: '#10b981', ring: 'ring-emerald-500/30', glow: 'rgba(16, 185, 129, 0.55)', typeLabel: 'prompt' },
  image:  { bg: 'bg-sky-400',     text: 'text-sky-950',     stroke: '#38bdf8', ring: 'ring-sky-400/30',    glow: 'rgba(56, 189, 248, 0.55)',  typeLabel: 'image' },
  // `images` (array) is distinguished by a lighter, greener cyan so users can
  // tell single-image vs image-array handles apart at a glance — not just via tooltip.
  images: { bg: 'bg-cyan-300',    text: 'text-cyan-950',    stroke: '#67e8f9', ring: 'ring-cyan-300/30',   glow: 'rgba(103, 232, 249, 0.55)', typeLabel: 'image array' },
  video:  { bg: 'bg-rose-500',    text: 'text-rose-950',    stroke: '#f43f5e', ring: 'ring-rose-500/30',   glow: 'rgba(244, 63, 94, 0.55)',  typeLabel: 'video' },
  entity: { bg: 'bg-violet-500',  text: 'text-violet-950',  stroke: '#8b5cf6', ring: 'ring-violet-500/30', glow: 'rgba(139, 92, 246, 0.55)', typeLabel: 'entity' },
  any:    { bg: 'bg-zinc-400',    text: 'text-zinc-900',    stroke: '#a1a1aa', ring: 'ring-zinc-400/30',   glow: 'rgba(161, 161, 170, 0.55)', typeLabel: 'any' },
}

export function colorFor(type: HandleType): HandleColor {
  return HANDLE_COLORS[type] || HANDLE_COLORS.any
}
