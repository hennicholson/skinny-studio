// DAG executor for canvas graphs.
//
// Runs client-side so the existing /api/generate endpoint (which expects the
// caller's Whop headers) can be reused unmodified. The executor walks a
// topological order, resolves each node's inputs from upstream output state,
// dispatches to /api/generate for model nodes, and writes results back.
//
// Notable behaviors:
// - Parallel execution: nodes at the same topological "level" run concurrently
//   bounded by `concurrency` (default 3) so we don't hammer Replicate.
// - Skipped-downstream: when a node fails, its descendants are marked as
//   `status: 'error'` with `error: 'Skipped: upstream <id> failed'`. We piggyback
//   on the existing 'error' status (NodeStatus is a closed union in ir.ts that
//   this file is not allowed to modify), and signal "skipped" via the error
//   message + a non-typed `skipped: true` flag on the patch.
// - AbortController: opts.signal cancels in-flight fetches and prevents
//   downstream starts.
// - HTTP retries: 5xx responses are retried once with a 1s backoff. 4xx is not
//   retried. Network errors are also retried once.
// - noWait polling: when /api/generate returns `{ pending: true, generationId }`,
//   the executor polls GET /api/generations/<id> every 2s up to 5 min.
// - Reference image cap: each model's `maxReferenceImages` (from
//   lib/orchestrator/model-specs.ts) truncates excessive refs; a warning is
//   emitted on the node patch.
// - Fan-out: variations run in parallel under the same concurrency cap.

import { Canvas, CanvasEdge, CanvasNode, NODE_TYPES, NodeStatus } from './ir'
import { getModelSpec } from '@/lib/orchestrator/model-specs'
import { askDirector } from './director-client'

export interface RunOptions {
  conversationId?: string
  signal?: AbortSignal
  concurrency?: number
  onNodeUpdate: (nodeId: string, patch: NodeUpdatePatch) => void
  getWhopHeaders: () => Record<string, string>
  // Canvas-source tracking. When provided, the executor stamps every
  // /api/generate request body with `params._skinny_source = { source: 'canvas',
  // canvasId, canvasNodeId, canvasRunId? }` so the persisted `generations` row
  // can later be filtered/labeled "from canvas" vs other sources (chat, etc.).
  // The /api/generate route already stashes the request body's `params` field
  // into `generations.parameters`, so no API-route change is needed.
  canvasId?: string
  canvasRunId?: string
  // Ids the caller wants re-executed even if they already have cached
  // outputUrls. Per-node Run sets this to the clicked node only — upstream
  // image-gen / video-gen / fan-out nodes with cached outputs are treated
  // as static inputs (their saved URLs are already in Skinny Hub, downstream
  // reads them via emit() without burning a re-run). The full-canvas Run all
  // button populates this with every gen node so the user's explicit "run
  // everything" still re-executes the full graph.
  forceRerun?: Set<string>
}

// Patch shape passed to onNodeUpdate. We accept extra non-IR fields so we can
// communicate transient runtime state (warnings, polling prediction id,
// "skipped" flag) without modifying the IR.
export type NodeUpdatePatch = Partial<CanvasNode['data']> & {
  pollingPredictionId?: string
  warning?: string
  // skipped is set when a node is being marked as 'error' because its upstream
  // failed; consumers can use this to render a distinct visual state.
  skipped?: boolean
  // fromCache is set when the executor short-circuits a gen node because it
  // already has outputUrls and isn't in forceRerun. Consumers should NOT
  // append to generationHistory, record cost, or fire balance/telemetry
  // events — nothing was actually billed.
  fromCache?: boolean
}

export class CycleError extends Error {
  constructor(public nodes: string[]) {
    super(`Cycle detected in canvas graph: ${nodes.join(' -> ')}`)
  }
}

// Kahn's algorithm. Returns nodes in execution order; throws CycleError if the
// graph has a cycle.
export function topologicalSort(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]))

  for (const e of edges) {
    if (!indegree.has(e.target) || !adj.has(e.source)) continue
    indegree.set(e.target, (indegree.get(e.target) || 0) + 1)
    adj.get(e.source)!.push(e.target)
  }

  const queue: string[] = []
  indegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id)
  })

  const order: CanvasNode[] = []
  const byId = new Map(nodes.map((n) => [n.id, n]))

  while (queue.length) {
    const id = queue.shift()!
    const node = byId.get(id)
    if (node) order.push(node)
    for (const next of adj.get(id) || []) {
      const d = (indegree.get(next) || 0) - 1
      indegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }

  if (order.length !== nodes.length) {
    const stuck = nodes.filter((n) => !order.find((o) => o.id === n.id)).map((n) => n.id)
    throw new CycleError(stuck)
  }

  return order
}

// Group nodes into topological "levels". All nodes in a level have no
// dependencies on each other, so they may run in parallel.
export function topologicalLevels(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[][] {
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  for (const e of edges) {
    if (!indegree.has(e.target) || !adj.has(e.source)) continue
    indegree.set(e.target, (indegree.get(e.target) || 0) + 1)
    adj.get(e.source)!.push(e.target)
  }

  let frontier: string[] = []
  indegree.forEach((deg, id) => {
    if (deg === 0) frontier.push(id)
  })

  const levels: CanvasNode[][] = []
  const seenCount = new Map<string, number>()
  let processed = 0

  while (frontier.length) {
    const levelNodes = frontier.map((id) => byId.get(id)!).filter(Boolean)
    levels.push(levelNodes)
    processed += frontier.length
    const next: string[] = []
    for (const id of frontier) {
      for (const child of adj.get(id) || []) {
        const c = (seenCount.get(child) ?? indegree.get(child) ?? 0) - 1
        seenCount.set(child, c)
        if (c === 0) next.push(child)
      }
    }
    frontier = next
  }

  if (processed !== nodes.length) {
    const stuck = nodes
      .filter((n) => !levels.some((lvl) => lvl.find((l) => l.id === n.id)))
      .map((n) => n.id)
    throw new CycleError(stuck)
  }

  return levels
}

// Detects whether adding `candidate` would create a cycle. Used by the editor
// before committing a new edge.
export function wouldCreateCycle(
  edges: CanvasEdge[],
  candidate: { source: string; target: string },
): boolean {
  const adj = new Map<string, string[]>()
  for (const e of [...edges, { source: candidate.source, target: candidate.target } as CanvasEdge]) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }
  // DFS from candidate.target; if we reach candidate.source, we'd cycle.
  const stack = [candidate.target]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === candidate.source) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of adj.get(id) || []) stack.push(next)
  }
  return false
}

// Collect inputs for `node` from upstream node state.
// For each input handle, walks incoming edges and reads the upstream output.
interface ResolvedInputs {
  prompt?: string
  startFrame?: string
  endFrame?: string
  refs: string[]
  raw: Record<string, any[]>
}

function resolveInputs(
  node: CanvasNode,
  edges: CanvasEdge[],
  byId: Map<string, CanvasNode>,
): ResolvedInputs {
  const incoming = edges.filter((e) => e.target === node.id)
  const raw: Record<string, any[]> = {}
  let prompt: string | undefined
  let startFrame: string | undefined
  let endFrame: string | undefined
  const refs: string[] = []

  for (const e of incoming) {
    const upstream = byId.get(e.source)
    if (!upstream) continue
    const handleBucket = raw[e.targetHandle] || (raw[e.targetHandle] = [])

    // What does the upstream node emit on the source handle?
    const emitted = emit(upstream, e.sourceHandle)
    handleBucket.push(emitted)

    if (e.targetHandle === 'in:prompt' && typeof emitted === 'string') {
      prompt = prompt ? `${prompt}\n${emitted}` : emitted
    } else if (e.targetHandle === 'in:start' && typeof emitted === 'string') {
      startFrame = emitted
    } else if (e.targetHandle === 'in:end' && typeof emitted === 'string') {
      endFrame = emitted
    } else if (e.targetHandle === 'in:ref') {
      if (Array.isArray(emitted)) refs.push(...emitted.filter(Boolean))
      else if (typeof emitted === 'string') refs.push(emitted)
    }
  }

  return { prompt, startFrame, endFrame, refs, raw }
}

// What value does `node` emit on its `handleId` output?
function emit(node: CanvasNode, handleId: string): any {
  switch (node.type) {
    case 'text-prompt':
      return interpolatePrompt(node.data.prompt || '', node)
    case 'reference-image':
      return node.data.imageUrl
    case 'reference-video':
      return node.data.videoUrl
    case 'entity': {
      // Emit per-handle:
      // - out:image  → the entity's saved image (used as a model reference)
      // - out:prompt → the description (vision_context). Falls back to the
      //   entity's name when no description is set so wiring an entity into
      //   `in:prompt` is never empty.
      // - out:entity → the structured record for downstream tooling.
      if (handleId === 'out:image') return node.data.imageUrl
      if (handleId === 'out:prompt') {
        const name = (node.data.title || '').trim()
        const desc = (node.data.visionContext || '').trim()
        if (desc && name) return `${name}: ${desc}`
        return desc || name
      }
      return {
        id: node.data.entityId,
        imageUrl: node.data.imageUrl,
        name: node.data.title,
        visionContext: node.data.visionContext,
      }
    }
    case 'skill':
      return node.data.prompt || ''
    case 'image-gen': {
      // Emit shape MUST match handle type or downstream wires silently drop:
      //   out:image  → first URL as a string (matches HandleType 'image')
      //   out:images → full array (matches HandleType 'images')
      // For sequential models (Seedream 4.5 sequential mode) outputUrls has
      // N items; downstream picks per-handle. For single-output models
      // out:images is [outputUrls[0]] which is still array-correct.
      const urls = node.data.outputUrls || []
      if (handleId === 'out:images') return urls
      // Default + out:image: single string (or undefined when no output yet,
      // which resolveInputs already tolerates via typeof checks).
      return urls[0]
    }
    case 'fan-out':
      // fan-out's output handle is typed `any` so the raw array passes
      // through. Downstream `in:ref` (images, multi) spreads it; downstream
      // `in:start`/`in:end` (image, single) currently can't pull a single
      // frame off an array — users should wire those through a separate
      // ref-image picker. The pre-fix bug was that this emit was hard-typed
      // `images` and a video-variations fan-out had no path through.
      return node.data.outputUrls || []
    case 'video-gen':
      // Single-string emit on out:video. Video models rarely batch but the
      // executor keeps the array-vs-string contract: handle is `video`
      // (single), so emit the first url as a string.
      return node.data.outputUrls?.[0]
    case 'orchestrator':
      return node.data.outputText || ''
    case 'production-brief':
      // out:brief → the long-form brief stashed in outputText.
      // out:prompt → the truncated 2500-char Seedance-shaped prompt with
      //              [Image1]…[ImageN] tokens. Falls back to outputText
      //              when the executor hasn't run yet (ensures downstream
      //              wires don't blow up on empty strings).
      if (handleId === 'out:brief') return node.data.outputText || ''
      if (handleId === 'out:prompt') return (node.data as any).distilledPrompt || node.data.outputText || ''
      return ''
    case 'output':
      return null
  }
}

// {{handle-name}} interpolation. For v1 only supports a single 'in:vars' handle
// resolving to a comma-joined string, plus the node's stored prompt.
function interpolatePrompt(template: string, node: CanvasNode): string {
  // No-op for now; vars resolved via raw.in:vars in the caller if needed.
  // Kept as a hook for future {{character}} {{world}} substitution.
  return template
}

// ===== HTTP helpers =====

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes per node when noWait
const RETRY_BACKOFF_MS = 1000

interface GenerateResult {
  outputUrls: string[]
  generationId?: string
  costCents?: number
}

class GenerateError extends Error {
  constructor(message: string, public retriable: boolean, public generationId?: string) {
    super(message)
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// POST /api/generate with 5xx retry-once semantics. Returns the parsed JSON
// regardless of pending/success — caller decides how to handle it.
async function callGenerate(
  body: Record<string, any>,
  opts: RunOptions,
): Promise<any> {
  let attempt = 0
  let lastErr: any
  while (attempt < 2) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...opts.getWhopHeaders() },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
      // Surface 4xx immediately so we don't waste a retry on user errors.
      if (res.status >= 400 && res.status < 500) {
        const json = await res.json().catch(() => ({}))
        throw new GenerateError(
          json.error || json.message || `HTTP ${res.status}`,
          false,
          json.generationId,
        )
      }
      if (res.status >= 500) {
        // retriable
        lastErr = new GenerateError(`HTTP ${res.status}`, true)
        attempt++
        if (attempt < 2) {
          await sleep(RETRY_BACKOFF_MS, opts.signal)
          continue
        }
        throw lastErr
      }
      return await res.json()
    } catch (err) {
      // AbortError or 4xx GenerateError: surface immediately.
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (err instanceof GenerateError && !err.retriable) throw err
      // Network / transient: retry once.
      lastErr = err
      attempt++
      if (attempt < 2) {
        await sleep(RETRY_BACKOFF_MS, opts.signal)
        continue
      }
      throw lastErr
    }
  }
  throw lastErr ?? new Error('callGenerate exhausted retries')
}

// Poll GET /api/generations/<id> until the generation reaches a terminal state
// or we time out. Returns the same shape as the synchronous /api/generate
// success response.
async function pollGeneration(
  generationId: string,
  predictionId: string | undefined,
  opts: RunOptions,
  onProgress: () => void,
): Promise<GenerateResult> {
  const started = Date.now()
  while (true) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new GenerateError('Timed out waiting for prediction', false, generationId)
    }
    try {
      const res = await fetch(`/api/generations/${generationId}`, {
        method: 'GET',
        headers: opts.getWhopHeaders(),
        signal: opts.signal,
      })
      if (res.ok) {
        const json = await res.json()
        if (json.replicate_status === 'succeeded') {
          return {
            outputUrls: json.output_urls || [],
            generationId,
          }
        }
        if (json.replicate_status === 'failed' || json.replicate_status === 'canceled') {
          throw new GenerateError(
            json.replicate_error || 'Generation failed',
            false,
            generationId,
          )
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (err instanceof GenerateError) throw err
      // transient network error during poll — just try again next tick
    }
    onProgress()
    await sleep(POLL_INTERVAL_MS, opts.signal)
  }
}

// Drives one generation: POST + (optionally) poll, returning the final URLs.
async function dispatchGenerate(
  body: Record<string, any>,
  opts: RunOptions,
  onPolling: (predictionId: string | undefined) => void,
): Promise<GenerateResult> {
  const json = await callGenerate(body, opts)
  // Pending path: server returned 200 with { pending: true, generationId }.
  if (json && json.pending && json.generationId) {
    onPolling(json.predictionId)
    return pollGeneration(json.generationId, json.predictionId, opts, () =>
      onPolling(json.predictionId),
    )
  }
  if (!json || json.success !== true) {
    throw new GenerateError(
      json?.error || json?.message || 'Generation failed',
      false,
      json?.generationId,
    )
  }
  return {
    outputUrls: json.outputUrls || json.images || json.imageUrls || [],
    generationId: json.generationId,
    costCents: json.cost ?? json.costCents ?? json.cost_cents,
  }
}

// Apply each model's maxReferenceImages cap. Returns truncated refs + an
// optional warning string when we had to drop images.
function capReferences(
  modelSlug: string | undefined,
  refs: string[],
): { refs: string[]; warning?: string } {
  if (!modelSlug) return { refs }
  const spec = getModelSpec(modelSlug)
  const max = spec?.maxReferenceImages
  if (!max || refs.length <= max) return { refs }
  return {
    refs: refs.slice(0, max),
    warning: `Model "${modelSlug}" accepts at most ${max} reference image${max === 1 ? '' : 's'}; dropped ${refs.length - max}.`,
  }
}

// Marker we tuck into `params._skinny_source` so the persisted generation row
// can be identified as canvas-originated. Survives a JSON round-trip and ends
// up in `generations.parameters._skinny_source` server-side without requiring
// any /api/generate route changes.
export interface CanvasSourceMarker {
  source: 'canvas'
  canvasId: string
  canvasNodeId: string
  canvasRunId?: string
}

interface CanvasSourceCtx {
  canvasId?: string
  canvasRunId?: string
  canvasNodeId: string
}

// Build the /api/generate POST body for an image/video node.
function buildBody(
  node: CanvasNode,
  inputs: ResolvedInputs,
  conversationId: string | undefined,
  refOverride?: string[],
  source?: CanvasSourceCtx,
): Record<string, any> {
  const refs = refOverride ?? inputs.refs
  const images: { url: string; purpose: 'reference' | 'starting_frame' | 'last_frame' }[] = []
  for (const url of refs) images.push({ url, purpose: 'reference' })
  if (inputs.startFrame) images.push({ url: inputs.startFrame, purpose: 'starting_frame' })
  if (inputs.endFrame) images.push({ url: inputs.endFrame, purpose: 'last_frame' })

  // Merge the canvas-source marker into params so the persisted
  // `generations.parameters` row can be identified as canvas-originated.
  // Only stamp when we have a canvasId — otherwise leave params untouched.
  const baseParams = node.data.params || {}
  const params: Record<string, any> = source?.canvasId
    ? {
        ...baseParams,
        _skinny_source: {
          source: 'canvas' as const,
          canvasId: source.canvasId,
          canvasNodeId: source.canvasNodeId,
          ...(source.canvasRunId ? { canvasRunId: source.canvasRunId } : {}),
        } satisfies CanvasSourceMarker,
      }
    : baseParams

  const body: Record<string, any> = {
    model: node.data.modelSlug,
    prompt: inputs.prompt,
    params,
    images,
    conversationId,
    // Hint server to return pending+poll when the run is long. Server-side
    // generate already supports this flag; we always set true so the executor
    // is timeout-resilient regardless of platform (Netlify limits, etc).
    noWait: true,
  }
  if (node.type === 'video-gen') {
    const p = node.data.params || {}
    if (p.duration != null) body.duration = p.duration
    if (p.resolution) body.resolution = p.resolution
    if (p.generate_audio != null) body.generateAudio = p.generate_audio
  }
  // Seedream sequential generation — surface as top-level body fields so the
  // /api/generate cost-preflight (which only inspects body.sequentialImageGeneration
  // + body.maxImages, not nested params) correctly budgets a multi-image run.
  if (
    node.type === 'image-gen' &&
    typeof node.data.modelSlug === 'string' &&
    node.data.modelSlug.startsWith('seedream')
  ) {
    const p = node.data.params || {}
    if (p.sequential_image_generation) {
      body.sequentialImageGeneration = p.sequential_image_generation
    }
    if (p.max_images != null) {
      body.maxImages = Number(p.max_images)
    }
  }
  return body
}

// ===== Concurrency control =====

// Tiny bounded-concurrency runner. Schedules `tasks` with at most `limit`
// running at once. Returns when all settle (each task is responsible for its
// own error handling — runWithConcurrency never throws).
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  signal?: AbortSignal,
): Promise<void> {
  if (limit < 1) limit = 1
  let next = 0
  const workers: Promise<void>[] = []
  for (let w = 0; w < Math.min(limit, tasks.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          if (signal?.aborted) return
          const i = next++
          if (i >= tasks.length) return
          try {
            await tasks[i]()
          } catch {
            // Tasks own their error reporting via onNodeUpdate. Swallow here so
            // one bad node doesn't break the pool.
          }
        }
      })(),
    )
  }
  await Promise.all(workers)
}

// ===== Main driver =====

export async function runCanvas(canvas: Canvas, opts: RunOptions): Promise<void> {
  const concurrency = Math.max(1, opts.concurrency ?? 3)
  const levels = topologicalLevels(canvas.nodes, canvas.edges)
  const byId = new Map(canvas.nodes.map((n) => [n.id, { ...n, data: { ...n.data } }]))
  const failed = new Set<string>()
  const skipped = new Set<string>()

  // Pre-compute reverse adjacency for fast "is any upstream failed?" lookups.
  const upstreamOf = new Map<string, string[]>()
  for (const n of canvas.nodes) upstreamOf.set(n.id, [])
  for (const e of canvas.edges) {
    const list = upstreamOf.get(e.target)
    if (list) list.push(e.source)
  }

  function isPoisoned(nodeId: string): { poisoned: boolean; cause?: string } {
    const ups = upstreamOf.get(nodeId) || []
    for (const u of ups) {
      if (failed.has(u)) return { poisoned: true, cause: u }
      if (skipped.has(u)) return { poisoned: true, cause: u }
    }
    return { poisoned: false }
  }

  function markFailed(node: CanvasNode, message: string, generationId?: string) {
    failed.add(node.id)
    const cur = byId.get(node.id)
    if (cur) cur.data = { ...cur.data, status: 'error', error: message, generationId }
    opts.onNodeUpdate(node.id, { status: 'error', error: message, generationId })
  }

  function markSkipped(node: CanvasNode, cause: string) {
    skipped.add(node.id)
    const cur = byId.get(node.id)
    const msg = `Skipped: upstream ${cause} failed`
    if (cur) cur.data = { ...cur.data, status: 'error', error: msg }
    opts.onNodeUpdate(node.id, { status: 'error', error: msg, skipped: true })
  }

  function markDone(node: CanvasNode, patch: NodeUpdatePatch) {
    const cur = byId.get(node.id)
    if (cur) cur.data = { ...cur.data, ...patch, status: 'done' }
    opts.onNodeUpdate(node.id, { ...patch, status: 'done' })
  }

  for (const level of levels) {
    if (opts.signal?.aborted) {
      for (const n of level) {
        opts.onNodeUpdate(n.id, { status: 'idle', error: 'Aborted' })
      }
      continue
    }

    const tasks = level.map((node) => async () => {
      if (opts.signal?.aborted) {
        opts.onNodeUpdate(node.id, { status: 'idle', error: 'Aborted' })
        return
      }
      // Skip if upstream failed/skipped.
      const poison = isPoisoned(node.id)
      if (poison.poisoned) {
        markSkipped(node, poison.cause!)
        return
      }
      await executeNode(node, canvas, byId, opts, {
        markFailed,
        markDone,
      })
    })

    await runWithConcurrency(tasks, concurrency, opts.signal)
  }
}

interface ExecHelpers {
  markFailed: (node: CanvasNode, message: string, generationId?: string) => void
  markDone: (node: CanvasNode, patch: NodeUpdatePatch) => void
}

async function executeNode(
  node: CanvasNode,
  canvas: Canvas,
  byId: Map<string, CanvasNode>,
  opts: RunOptions,
  helpers: ExecHelpers,
): Promise<void> {
  // Static input nodes don't run.
  if (
    node.type === 'text-prompt' ||
    node.type === 'reference-image' ||
    node.type === 'reference-video' ||
    node.type === 'entity' ||
    node.type === 'skill'
  ) {
    helpers.markDone(node, {})
    return
  }

  // Cached-output short-circuit. When the caller didn't explicitly opt this
  // node into a re-run (forceRerun set), and the node already has produced
  // outputs (image-gen / video-gen / fan-out), treat it as a static input:
  // mark done, surface the existing URLs unchanged, and let downstream nodes
  // read them via emit(). This is the per-node Run hot-path — the user
  // generates an image once, wires its output into a downstream node, clicks
  // Run on the downstream, and we don't re-bill them for an upstream rerun.
  // fromCache=true tells the caller to skip generationHistory append, cost
  // tracking, and telemetry — nothing was actually billed.
  if (
    (node.type === 'image-gen' || node.type === 'video-gen' || node.type === 'fan-out') &&
    !opts.forceRerun?.has(node.id) &&
    Array.isArray(node.data.outputUrls) &&
    node.data.outputUrls.length > 0
  ) {
    helpers.markDone(node, { outputUrls: node.data.outputUrls, fromCache: true })
    return
  }

  // Output node collects upstream URLs.
  if (node.type === 'output') {
    const inputs = resolveInputs(node, canvas.edges, byId)
    const urls: string[] = []
    for (const v of Object.values(inputs.raw).flat()) {
      if (typeof v === 'string') urls.push(v)
      else if (Array.isArray(v)) urls.push(...v.filter((x) => typeof x === 'string'))
    }
    helpers.markDone(node, { outputUrls: urls })
    return
  }

  // Orchestrator: ask the Creative Director for a prompt and stash it in
  // outputText. Downstream nodes wired to `out:prompt` consume it via emit().
  //
  // Behaviour:
  // - We ask the Director for a single, ready-to-paste image/video prompt
  //   based on the current canvas state + any incoming `in:context` text.
  // - We surface the streamed text into outputText, then markDone.
  // - Failures fall back to empty text + an error status so downstream
  //   nodes can decide whether to fail-fast or keep going (executor's
  //   poison logic will skip them since orchestrator failure marks failed).
  if (node.type === 'orchestrator') {
    const inputs = resolveInputs(node, canvas.edges, byId)
    const userInstruction =
      (node.data.prompt || '').trim() ||
      'Write one concrete, vivid image-generation prompt that fits the current canvas. Reply with only the prompt text — no preamble, quotes, or commentary.'

    // Optional context blob from any wired `in:context` upstreams (we keep
    // it short — Director already gets the canvas description).
    const contextChunks: string[] = []
    for (const v of inputs.raw['in:context'] || []) {
      if (typeof v === 'string' && v.trim()) contextChunks.push(v.trim())
    }
    const userMessage = contextChunks.length
      ? `${userInstruction}\n\n[Upstream context]\n${contextChunks.join('\n---\n')}`
      : userInstruction

    opts.onNodeUpdate(node.id, { status: 'running', error: undefined })

    try {
      let full = ''
      for await (const chunk of askDirector({
        canvas,
        selectedNodeId: node.id,
        userMessage,
        getHeaders: opts.getWhopHeaders,
        signal: opts.signal,
      })) {
        if (chunk.type === 'delta') {
          full += chunk.delta
          // Stream incremental text into the node so the UI can preview it.
          opts.onNodeUpdate(node.id, { status: 'running', outputText: full })
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error)
        } else if (chunk.type === 'done') {
          full = chunk.full || full
        }
      }
      const text = full.trim()
      if (!text) {
        helpers.markFailed(node, 'Director returned no text')
        return
      }
      helpers.markDone(node, { outputText: text })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      helpers.markFailed(node, msg)
    }
    return
  }

  // Production-brief: distill upstream storyboard refs + concept into a
  // long-form brief AND a 2500-char Seedance-shaped distilled prompt.
  //
  // Inputs:
  //   in:storyboard — multi `images`. Each upstream node's emitted image URL
  //                   (reference-image / image-gen / fan-out / entity image).
  //                   We also read each upstream's `visionContext` so the
  //                   Director sees what's IN each frame, not just URLs.
  //   in:concept    — single `prompt`. Optional high-level brief brief.
  //
  // Output:
  //   outputText        → long-form brief (unbounded length)
  //   distilledPrompt   → Seedance-ready prompt (≤2500 chars, hard truncate)
  //
  // We reuse the same Director the canvas chat uses (askDirector → /api/chat).
  // It already handles provider switching, API keys, and streaming. We instruct
  // the model to reply with a single fenced JSON block { brief, distilledPrompt }
  // and parse it client-side.
  if (node.type === 'production-brief') {
    opts.onNodeUpdate(node.id, { status: 'running', error: undefined })

    // Walk incoming edges manually so we can correlate each storyboard image
    // URL with the upstream node's visionContext.
    const incoming = canvas.edges.filter((e) => e.target === node.id)
    const refs: { url: string; visionContext?: string; label?: string }[] = []
    let conceptText = ''
    for (const e of incoming) {
      const upstream = byId.get(e.source)
      if (!upstream) continue
      if (e.targetHandle === 'in:storyboard') {
        const emitted = emit(upstream, e.sourceHandle)
        const upstreamVision = (upstream.data as any).visionContext as string | undefined
        const upstreamLabel = (upstream.data.title as string | undefined) || undefined
        if (Array.isArray(emitted)) {
          for (const u of emitted) {
            if (typeof u === 'string' && u) refs.push({ url: u, visionContext: upstreamVision, label: upstreamLabel })
          }
        } else if (typeof emitted === 'string' && emitted) {
          refs.push({ url: emitted, visionContext: upstreamVision, label: upstreamLabel })
        }
      } else if (e.targetHandle === 'in:concept') {
        const emitted = emit(upstream, e.sourceHandle)
        if (typeof emitted === 'string' && emitted.trim()) {
          conceptText = conceptText ? `${conceptText}\n${emitted}` : emitted
        }
      }
    }

    // Cap at the target model's reference image limit (Seedance: 9). Use the
    // node's targetModel data if specified, else default to Seedance.
    const targetSlug = (node.data as any).targetModel || 'seedance-2.0'
    const targetSpec = getModelSpec(targetSlug)
    const refCap = targetSpec?.maxReferenceImages ?? 9
    const truncatedRefs = refs.slice(0, refCap)
    if (refs.length > refCap) {
      opts.onNodeUpdate(node.id, {
        warning: `Production brief: ${targetSlug} accepts at most ${refCap} reference image${refCap === 1 ? '' : 's'}; dropped ${refs.length - refCap}.`,
      })
    }

    if (!conceptText && truncatedRefs.length === 0) {
      helpers.markFailed(node, 'Production brief needs either a concept on in:concept or storyboard refs on in:storyboard.')
      return
    }

    const style = (node.data as any).style || 'cinematic'
    const motion = (node.data as any).motionEmphasis || 'standard'
    const audioFocus = (node.data as any).audioFocus !== false // default true
    const extra = ((node.data as any).extraNotes || '').trim()
    const maxChars = targetSpec?.maxPromptChars ?? 2500

    // Build a structured user message. The Director already has full
    // model knowledge baked into its system prompt, so we keep this terse
    // and request a fenced JSON block back.
    const refLines = truncatedRefs.map((r, i) => {
      const idx = i + 1
      const labelPart = r.label ? ` "${r.label}"` : ''
      const visionPart = r.visionContext ? `\n      vision: ${r.visionContext}` : ''
      return `   [Image${idx}]${labelPart} url=${r.url}${visionPart}`
    }).join('\n')

    const userInstruction = [
      `PRODUCTION BRIEF JOB — distill these inputs into a Seedance-shaped plan. Reply with ONE fenced \`\`\`json block, NOTHING else.`,
      ``,
      `Concept (in:concept):`,
      conceptText ? conceptText : '   (none — infer from references)',
      ``,
      truncatedRefs.length
        ? `Storyboard references (in:storyboard, ${truncatedRefs.length}):\n${refLines}`
        : `Storyboard references: (none)`,
      ``,
      `Settings:`,
      `   targetModel: ${targetSlug}`,
      `   style: ${style}`,
      `   motionEmphasis: ${motion}`,
      `   audioFocus: ${audioFocus}`,
      extra ? `   extraNotes: ${extra}` : '   extraNotes: (none)',
      ``,
      `Required reply shape:`,
      '```json',
      `{ "brief": "<long-form production brief — cinematography, lensing, lighting, color, blocking, pacing — no length cap>",`,
      `  "distilledPrompt": "<≤${maxChars}-char Seedance-shaped prompt referencing each ref as [Image1]..[Image${truncatedRefs.length}] in the order listed above${audioFocus ? '. Include dialogue lines in double quotes plus SFX/BGM cues' : '. No audio cues'}>" }`,
      '```',
      ``,
      `Hard rules for distilledPrompt:`,
      `- Use bracketed [Image1]…[Image${truncatedRefs.length}] tokens to call out each reference exactly once.`,
      `- Include camera vocab (lens, move), lighting, color, and pacing language from the cinematography toolkit.`,
      `- ${audioFocus ? 'Dialogue lines MUST appear in double quotes; add SFX and BGM tags.' : 'Do NOT include dialogue or audio cues — audio is off for this brief.'}`,
      `- Hard cap: ${maxChars} characters. The host will truncate with an ellipsis if you overshoot.`,
    ].join('\n')

    try {
      let full = ''
      for await (const chunk of askDirector({
        canvas,
        selectedNodeId: node.id,
        userMessage: userInstruction,
        getHeaders: opts.getWhopHeaders,
        signal: opts.signal,
      })) {
        if (chunk.type === 'delta') {
          full += chunk.delta
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error)
        } else if (chunk.type === 'done') {
          full = chunk.full || full
        }
      }
      const parsed = parseProductionBriefReply(full)
      if (!parsed) {
        helpers.markFailed(node, 'Director did not return a valid {brief, distilledPrompt} JSON block.')
        return
      }
      let distilled = parsed.distilledPrompt || ''
      let warning: string | undefined
      if (distilled.length > maxChars) {
        // Hard truncate with ellipsis. Log a warning so the user sees the cut.
        distilled = distilled.slice(0, maxChars - 1) + '…'
        warning = `Production brief: distilled prompt exceeded ${maxChars} chars (${parsed.distilledPrompt.length}); truncated to fit.`
      }
      helpers.markDone(node, {
        outputText: parsed.brief || '',
        distilledPrompt: distilled,
        ...(warning ? { warning } : {}),
      } as any)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      helpers.markFailed(node, msg)
    }
    return
  }

  // Image / Video model node.
  if (node.type === 'image-gen' || node.type === 'video-gen') {
    void NODE_TYPES[node.type] // touch to satisfy lint; kept for future schema-driven validation
    const inputs = resolveInputs(node, canvas.edges, byId)
    if (!node.data.modelSlug) {
      helpers.markFailed(node, 'No model selected')
      return
    }
    if (!inputs.prompt) {
      helpers.markFailed(node, 'Missing prompt')
      return
    }

    // Cap references against the model's spec.
    const capped = capReferences(node.data.modelSlug, inputs.refs)
    if (capped.warning) {
      opts.onNodeUpdate(node.id, { warning: capped.warning })
    }

    opts.onNodeUpdate(node.id, { status: 'running', error: undefined })

    try {
      const body = buildBody(
        node,
        { ...inputs, refs: capped.refs },
        opts.conversationId,
        undefined,
        {
          // Fall back to the canvas IR id so source-tagging works even when
          // the caller didn't thread `opts.canvasId` through. CanvasShell is
          // off-limits to this audit, so this fallback is the gateway that
          // makes telemetry "just work" without a CanvasShell change.
          canvasId: opts.canvasId || canvas.id,
          canvasRunId: opts.canvasRunId,
          canvasNodeId: node.id,
        },
      )
      const result = await dispatchGenerate(body, opts, (predictionId) => {
        opts.onNodeUpdate(node.id, {
          status: 'running',
          pollingPredictionId: predictionId,
        })
      })
      helpers.markDone(node, {
        outputUrls: result.outputUrls,
        generationId: result.generationId,
        costCents: result.costCents,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const generationId = err instanceof GenerateError ? err.generationId : undefined
      helpers.markFailed(node, msg, generationId)
    }
    return
  }

  // Fan-out: parallel re-runs of the upstream model node.
  if (node.type === 'fan-out') {
    const incoming = canvas.edges.find((e) => e.target === node.id)
    if (!incoming) {
      helpers.markFailed(node, 'No source connected')
      return
    }
    const upstream = byId.get(incoming.source)
    const n = Math.max(1, Math.min(8, node.data.variations || 4))
    if (!upstream || (upstream.type !== 'image-gen' && upstream.type !== 'video-gen')) {
      helpers.markFailed(node, 'Fan-out source must be a model node')
      return
    }
    const inputs = resolveInputs(upstream, canvas.edges, byId)
    if (!upstream.data.modelSlug || !inputs.prompt) {
      helpers.markFailed(node, 'Upstream missing model or prompt')
      return
    }

    const capped = capReferences(upstream.data.modelSlug, inputs.refs)
    if (capped.warning) {
      opts.onNodeUpdate(node.id, { warning: capped.warning })
    }

    opts.onNodeUpdate(node.id, { status: 'running', error: undefined })

    const collected: string[] = []
    const collectedMu: Promise<void>[] = []

    const variationTasks: Array<() => Promise<void>> = []
    for (let i = 0; i < n; i++) {
      variationTasks.push(async () => {
        if (opts.signal?.aborted) return
        const baseBody = buildBody(
          upstream,
          { ...inputs, refs: capped.refs },
          opts.conversationId,
          undefined,
          {
            // Same canvas.id fallback as the regular model branch above.
            canvasId: opts.canvasId || canvas.id,
            canvasRunId: opts.canvasRunId,
            // Tag with the FAN-OUT node id (the actor the user actually
            // ran), not the upstream — keeps re-runs distinguishable from
            // regular runs of the upstream model.
            canvasNodeId: node.id,
          },
        )
        const variationBody = {
          ...baseBody,
          // unique seed per variation so we don't get identical outputs.
          // Spread the source-stamped params back in so we don't drop the
          // _skinny_source marker that buildBody just attached.
          params: {
            ...(baseBody.params || {}),
            seed: Math.floor(Math.random() * 1e9),
          },
        }
        try {
          const result = await dispatchGenerate(variationBody, opts, () => {
            // optional: could surface per-variation polling state, but to
            // keep the patch surface stable we just keep "running".
          })
          collected.push(...result.outputUrls)
        } catch {
          // swallow per-variation; outer marks success if any completed
        }
      })
    }
    await runWithConcurrency(
      variationTasks,
      Math.max(1, opts.concurrency ?? 3),
      opts.signal,
    )
    void collectedMu

    if (collected.length > 0) {
      helpers.markDone(node, { outputUrls: collected })
    } else {
      helpers.markFailed(node, 'All variations failed')
    }
    return
  }
}

// Tolerant JSON extractor for the production-brief Director reply.
// Accepts: a fenced ```json … ``` block, a fenced ``` … ``` block, or raw
// JSON in the body. Returns null when no parseable {brief, distilledPrompt}
// shape is found. We DON'T validate the bracketed [ImageN] tokens here —
// the model occasionally riffs on the schema, so we accept anything that
// has both string fields and let the downstream Seedance node be the
// final arbiter (it'll just ignore tokens that don't resolve).
function parseProductionBriefReply(text: string): { brief: string; distilledPrompt: string } | null {
  if (!text) return null
  // 1. Fenced json block.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fenced && fenced[1]) candidates.push(fenced[1].trim())
  // 2. First {…} substring (greedy on outer braces). Handles models that
  //    drop the fence.
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1))
  }
  // 3. Whole reply as a fallback.
  candidates.push(text.trim())

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c)
      if (obj && typeof obj === 'object') {
        const brief = typeof obj.brief === 'string' ? obj.brief : ''
        const distilledPrompt =
          typeof obj.distilledPrompt === 'string' ? obj.distilledPrompt : (typeof obj.distilled_prompt === 'string' ? obj.distilled_prompt : '')
        if (brief || distilledPrompt) return { brief, distilledPrompt }
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

export function summarizeStatuses(nodes: CanvasNode[]): Record<NodeStatus, number> {
  const out: Record<NodeStatus, number> = { idle: 0, queued: 0, running: 0, done: 0, error: 0 }
  for (const n of nodes) out[n.data.status]++
  return out
}
