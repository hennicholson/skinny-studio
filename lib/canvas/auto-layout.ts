// Deterministic canvas auto-layout. Pure function — no React, no DOM.
// Given the current nodes + edges, computes a fresh {x, y} for every node
// such that the graph reads as a clean left-to-right (or top-to-bottom)
// data flow:
//
//   inputs (text-prompt, reference-image, entity, skill, orchestrator)
//     │
//     ▼
//   model nodes (image-gen, video-gen)
//     │
//     ▼
//   fan-out, output
//
// The algorithm is a simple longest-path topological rank:
//   1. Build incoming-edge counts per node.
//   2. Roots (incoming == 0) start at rank 0.
//   3. For each node in topological order, rank = max(rank(predecessors)) + 1.
//   4. Group by rank. Each rank becomes a column (LR) or row (TB).
//   5. Within a column, sort nodes by their average upstream y so connected
//      nodes line up; then stack vertically with rowGap spacing.
//   6. Center every column around y=0 so the graph is visually balanced.
//
// Cycles are handled by detecting nodes that never reach indegree 0 and
// appending them to the highest rank we did process (graceful degradation).
//
// Orphans (no edges either way) get their own rank-0 column to keep them
// out of the main flow — they're typically references the user hasn't
// wired yet, and we don't want them disrupting the layout of the wired
// portion.

export interface LayoutNode {
  id: string
  /** Visual width hint. Defaults to NODE_WIDTH below if not provided. */
  width?: number
  /** Visual height hint. Defaults to NODE_HEIGHT. */
  height?: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutOptions {
  direction?: 'LR' | 'TB'
  columnGap?: number
  rowGap?: number
  origin?: { x: number; y: number }
}

export interface LayoutResult {
  /** Map of nodeId -> new absolute position. Apply to React Flow nodes. */
  positions: Map<string, { x: number; y: number }>
  /** Bounding box of the laid-out graph in flow coords. Useful for fitView. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** Number of nodes that landed in each rank, top-to-bottom by rank index. */
  ranks: number[]
}

// Default footprint of a node card. Lines up with what SkinnyNode renders at.
const NODE_WIDTH = 220
const NODE_HEIGHT = 160

export function autoLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: LayoutOptions = {},
): LayoutResult {
  const direction = opts.direction || 'LR'
  const columnGap = opts.columnGap ?? 320
  const rowGap = opts.rowGap ?? 200
  const origin = opts.origin || { x: 0, y: 0 }

  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) {
    return {
      positions,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      ranks: [],
    }
  }

  // ----- Topological rank assignment ---------------------------------------
  // Edges may reference nodes that have been deleted but not pruned; ignore
  // those edges so we don't poison the indegree map.
  const nodeIds = new Set(nodes.map((n) => n.id))
  const cleanEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  const nodeIdList = Array.from(nodeIds)
  for (const id of nodeIdList) {
    incoming.set(id, [])
    outgoing.set(id, [])
  }
  for (const e of cleanEdges) {
    incoming.get(e.target)!.push(e.source)
    outgoing.get(e.source)!.push(e.target)
  }

  // Kahn-style longest-path rank. Roots: incoming.length === 0.
  // Multi-pass — for each node, rank = max(rank(parents)) + 1.
  const rank = new Map<string, number>()
  for (const id of nodeIdList) {
    if ((incoming.get(id) || []).length === 0) {
      rank.set(id, 0)
    }
  }

  // Propagate via BFS from roots until stable. Cap iterations at N*N to
  // bail on cycles without spinning forever.
  const queue: string[] = Array.from(rank.keys())
  let iter = 0
  const maxIter = nodes.length * nodes.length + 10
  while (queue.length && iter < maxIter) {
    iter++
    const cur = queue.shift()!
    const curRank = rank.get(cur) ?? 0
    const children = outgoing.get(cur) || []
    for (const c of children) {
      const next = curRank + 1
      const existing = rank.get(c)
      if (existing === undefined || existing < next) {
        rank.set(c, next)
        queue.push(c)
      }
    }
  }

  // Anything still unranked is part of a cycle. Park them at the deepest
  // rank we've seen so they at least show up at the right edge.
  let maxRank = 0
  const rankValues = Array.from(rank.values())
  for (const r of rankValues) maxRank = Math.max(maxRank, r)
  for (const id of nodeIdList) {
    if (!rank.has(id)) rank.set(id, maxRank)
  }

  // ----- Group by rank -----------------------------------------------------
  const byRank = new Map<number, string[]>()
  const rankEntries = Array.from(rank.entries())
  for (const [id, r] of rankEntries) {
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(id)
  }
  const sortedRanks = Array.from(byRank.keys()).sort((a, b) => a - b)

  // ----- Sort within rank to minimize edge crossings -----------------------
  // Heuristic: a node's "preferred y" is the average preferred-y of its
  // upstream parents. Process ranks left-to-right and assign each node's
  // sort key based on parents' indices.
  const sortIndex = new Map<string, number>()
  for (const r of sortedRanks) {
    const ids = byRank.get(r)!
    if (r === 0) {
      // Stable original order for roots — nothing upstream to anchor to.
      ids.forEach((id, i) => sortIndex.set(id, i))
      continue
    }
    const withScore = ids.map((id) => {
      const parents = incoming.get(id) || []
      if (parents.length === 0) return { id, score: 0 }
      let sum = 0
      let n = 0
      for (const p of parents) {
        const idx = sortIndex.get(p)
        if (typeof idx === 'number') {
          sum += idx
          n++
        }
      }
      return { id, score: n > 0 ? sum / n : 0 }
    })
    withScore.sort((a, b) => a.score - b.score)
    withScore.forEach(({ id }, i) => sortIndex.set(id, i))
    byRank.set(r, withScore.map((s) => s.id))
  }

  // ----- Compute positions -------------------------------------------------
  // For LR: rank goes along x, sibling index along y. Each rank's column is
  // centered vertically around y=0 by computing -((count-1)/2) * rowGap as
  // the column's top.
  const nodeFootprint = new Map<string, { w: number; h: number }>()
  for (const n of nodes) {
    nodeFootprint.set(n.id, { w: n.width ?? NODE_WIDTH, h: n.height ?? NODE_HEIGHT })
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const r of sortedRanks) {
    const ids = byRank.get(r)!
    const count = ids.length
    const totalHeight = (count - 1) * rowGap
    const colTop = -totalHeight / 2
    for (let i = 0; i < count; i++) {
      const id = ids[i]
      const fp = nodeFootprint.get(id) || { w: NODE_WIDTH, h: NODE_HEIGHT }
      let x: number
      let y: number
      if (direction === 'LR') {
        x = origin.x + r * columnGap
        y = origin.y + colTop + i * rowGap
      } else {
        // TB: rank along y, sibling along x.
        y = origin.y + r * columnGap
        x = origin.x + colTop + i * rowGap
      }
      positions.set(id, { x, y })
      const right = x + fp.w
      const bottom = y + fp.h
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (right > maxX) maxX = right
      if (bottom > maxY) maxY = bottom
    }
  }

  if (positions.size === 0) {
    return {
      positions,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      ranks: [],
    }
  }

  return {
    positions,
    bounds: { minX, minY, maxX, maxY },
    ranks: sortedRanks.map((r) => (byRank.get(r) || []).length),
  }
}
