'use client'

// Live preview of a canvas as a small SVG graph. Used in the "pick up where
// you left off" recent-canvases rail so users can recognize what's inside
// each saved canvas at a glance without opening it.
//
// What it draws:
//   - Each node as a colored dot positioned via the same auto-layout
//     algorithm the Director uses to tidy the canvas. Deterministic — same
//     graph always produces the same preview.
//   - Each edge as a soft bezier curve between dots. Color follows the
//     source handle's type (prompt = emerald, image = sky, video = rose,
//     etc.) so the preview reads as "what's flowing where".
//   - If any model node has produced output(s), the most recent output
//     thumbnail tints the preview as a soft background — a fingerprint of
//     the canvas's actual creative output.
//
// Cost: pure SVG, no canvas API, no React Flow, no images downloaded
// unless the latest-output thumb is present (in which case it's a single
// <image> tag the browser caches normally).

import { useMemo } from 'react'
import { autoLayout } from '@/lib/canvas/auto-layout'

interface MiniGraphProps {
  nodes: Array<{
    id: string
    type: string
    data?: any
    position?: { x: number; y: number }
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>
  /** Internal SVG viewBox width — used for layout math, not visual size.
      The SVG renders responsively to its container's CSS width. */
  viewBoxWidth?: number
  /** Internal SVG viewBox height. */
  height?: number
  className?: string
}

// Type → color. Image refs / generated images render sky-blue; prompts emerald;
// videos rose; everything else a quiet zinc so the load-bearing types pop.
const TYPE_COLOR: Record<string, string> = {
  'text-prompt': '#10b981',         // emerald
  skill: '#10b981',                  // skill emits prompt too
  'reference-image': '#38bdf8',      // sky
  entity: '#8b5cf6',                 // violet (entity is part-image part-prompt)
  'image-gen': '#fbbf24',            // amber (model)
  'video-gen': '#f43f5e',            // rose (model, matches video edge color)
  'fan-out': '#a78bfa',              // violet-300 (variations)
  output: '#a1a1aa',                 // zinc
  orchestrator: '#c084fc',           // purple
  'production-brief': '#f59e0b',     // amber-500 (heavier brief)
}

const EDGE_COLOR_BY_SOURCE_TYPE: Record<string, string> = {
  prompt: '#10b981',
  image: '#38bdf8',
  images: '#38bdf8',
  video: '#f43f5e',
  entity: '#8b5cf6',
  any: '#52525b',
}

function inferEdgeColor(sourceHandle?: string): string {
  if (!sourceHandle) return EDGE_COLOR_BY_SOURCE_TYPE.any
  if (sourceHandle.includes('prompt')) return EDGE_COLOR_BY_SOURCE_TYPE.prompt
  if (sourceHandle.includes('image')) return EDGE_COLOR_BY_SOURCE_TYPE.image
  if (sourceHandle.includes('video')) return EDGE_COLOR_BY_SOURCE_TYPE.video
  if (sourceHandle.includes('entity')) return EDGE_COLOR_BY_SOURCE_TYPE.entity
  return EDGE_COLOR_BY_SOURCE_TYPE.any
}

export function CanvasMiniGraph({
  nodes,
  edges,
  viewBoxWidth = 320,
  height = 88,
  className,
}: MiniGraphProps) {
  const width = viewBoxWidth
  const layout = useMemo(() => {
    if (nodes.length === 0) {
      return null
    }
    // Always recompute layout deterministically — DO NOT use the user's
    // saved positions, since those might be scattered. The mini preview is
    // about the SHAPE of the workflow, not where the user dragged things.
    const res = autoLayout(
      nodes.map((n) => ({ id: n.id })),
      edges.map((e) => ({ source: e.source, target: e.target })),
      { direction: 'LR', columnGap: 80, rowGap: 50 },
    )
    return res
  }, [nodes, edges])

  // Find the most-recent generation output to tint the preview background.
  const previewImageUrl = useMemo(() => {
    for (const n of nodes) {
      const urls: string[] | undefined =
        n.data?.outputUrls && Array.isArray(n.data.outputUrls) && n.data.outputUrls.length
          ? n.data.outputUrls
          : n.type === 'reference-image' && n.data?.imageUrl
            ? [n.data.imageUrl]
            : undefined
      if (urls?.length) return urls[0]
    }
    return null
  }, [nodes])

  if (!layout || nodes.length === 0) {
    return (
      <div
        className={className}
        style={{
          width: '100%',
          height,
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.04) 100%)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>empty</span>
      </div>
    )
  }

  // Compute the layout bounds, then fit into the preview viewport with padding.
  const { minX, maxX, minY, maxY } = layout.bounds
  const PAD = 12
  const innerW = Math.max(1, maxX - minX)
  const innerH = Math.max(1, maxY - minY)
  const scaleX = (width - PAD * 2) / innerW
  const scaleY = (height - PAD * 2) / innerH
  const scale = Math.min(scaleX, scaleY, 1)
  // Centering offsets so a small graph doesn't get pinned to one corner.
  const usedW = innerW * scale
  const usedH = innerH * scale
  const offsetX = (width - usedW) / 2 - minX * scale
  const offsetY = (height - usedH) / 2 - minY * scale

  const project = (x: number, y: number) => ({
    x: x * scale + offsetX,
    y: y * scale + offsetY,
  })

  const NODE_R = 3.5
  const positionedNodes = nodes.map((n) => {
    const p = layout.positions.get(n.id)
    if (!p) return null
    const xy = project(p.x, p.y)
    return { node: n, x: xy.x, y: xy.y }
  }).filter(Boolean) as Array<{ node: typeof nodes[number]; x: number; y: number }>

  const projectedEdges = edges
    .map((e) => {
      const s = positionedNodes.find((pn) => pn.node.id === e.source)
      const t = positionedNodes.find((pn) => pn.node.id === e.target)
      if (!s || !t) return null
      const stroke = inferEdgeColor(e.sourceHandle)
      // Bezier control points — pulls toward horizontal flow so the curves
      // read as "data flowing left to right" even on diagonal connections.
      const cp = Math.abs(t.x - s.x) * 0.45
      return {
        id: e.id,
        d: `M ${s.x} ${s.y} C ${s.x + cp} ${s.y}, ${t.x - cp} ${t.y}, ${t.x} ${t.y}`,
        stroke,
      }
    })
    .filter(Boolean) as Array<{ id: string; d: string; stroke: string }>

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height,
        position: 'relative',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
      }}
      aria-hidden
    >
      {/* Background: tint with the latest output thumbnail at very low
          opacity so each canvas has a unique color cast without competing
          for attention with the wire diagram on top. */}
      {previewImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewImageUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.22,
            filter: 'blur(8px) saturate(1.4)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {/* Edges first so node dots paint over endpoints. */}
        {projectedEdges.map((e) => (
          <path
            key={e.id}
            d={e.d}
            stroke={e.stroke}
            strokeWidth={1.25}
            fill="none"
            strokeLinecap="round"
            opacity={0.7}
          />
        ))}
        {/* Node dots. */}
        {positionedNodes.map(({ node, x, y }) => {
          const color = TYPE_COLOR[node.type] || '#71717a'
          return (
            <g key={node.id}>
              {/* Soft halo so dots read on top of the blurred bg image. */}
              <circle cx={x} cy={y} r={NODE_R + 2} fill={color} opacity={0.18} />
              <circle cx={x} cy={y} r={NODE_R} fill={color} />
              <circle
                cx={x}
                cy={y}
                r={NODE_R}
                fill="none"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={0.5}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
