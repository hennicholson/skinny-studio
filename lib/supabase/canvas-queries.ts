// Canvas persistence layer.
// Translates between the in-memory Canvas IR (lib/canvas/ir.ts) and the
// canvases / canvas_nodes / canvas_edges tables. All calls go through
// sbAdmin so they work from server route handlers; the Whop auth check
// happens upstream in the API route.
//
// Save protocol (see migration 20260511170733_canvas_sync.sql):
//   1. GET returns { canvas, version, lastEditedBySession }.
//   2. PUT sends { canvas, expectedVersion?, sessionId? }.
//      - If expectedVersion mismatches the row, saveCanvas throws a
//        VersionConflictError carrying the current version. The route
//        translates that to a 409 so the client can merge + retry.
//      - On match, we diff incoming nodes/edges against existing rows and
//        upsert/insert/delete only what changed. The canvases row update
//        bumps `version` via trigger; we read the new version back and
//        return it.
//   3. A 500ms per-canvas server-side rate limit guards against pathological
//      autosave loops (the client already debounces 1.5s, this is a floor).

import { sbAdmin } from '@/lib/supabaseAdmin'
import { Canvas, CanvasEdge, CanvasNode, NodeType } from '@/lib/canvas/ir'
import { rateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface CanvasRow {
  id: string
  user_id: string
  title: string
  viewport_json: { x: number; y: number; zoom: number }
  version: number
  last_edited_by_session: string | null
  created_at: string
  updated_at: string
}

interface NodeRow {
  id: string
  canvas_id: string
  client_node_id: string
  type: string
  position_x: number
  position_y: number
  data_json: any
  generation_id: string | null
  created_at: string
  updated_at: string
}

interface EdgeRow {
  id: string
  canvas_id: string
  client_edge_id: string
  source_client_node_id: string
  source_handle: string
  target_client_node_id: string
  target_handle: string
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class VersionConflictError extends Error {
  readonly currentVersion: number
  readonly lastEditedBySession: string | null
  constructor(currentVersion: number, lastEditedBySession: string | null) {
    super(`version_conflict: current=${currentVersion}`)
    this.name = 'VersionConflictError'
    this.currentVersion = currentVersion
    this.lastEditedBySession = lastEditedBySession
  }
}

export class SaveRateLimitedError extends Error {
  readonly retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`save_rate_limited: retry_after=${retryAfterMs}ms`)
    this.name = 'SaveRateLimitedError'
    this.retryAfterMs = retryAfterMs
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCanvases(userId: string): Promise<Canvas[]> {
  const { data, error } = await sbAdmin
    .from('canvases')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data as CanvasRow[]).map(rowToCanvasHeader)
}

/**
 * List canvases AND their nodes/edges in a single batch — used by the
 * landing page's "pick up where you left off" rail to render mini-graph
 * previews. Two queries total regardless of how many canvases the user
 * has, because we fetch ALL their nodes/edges with one `.in('canvas_id', ids)`
 * each and then bucket by canvas_id client-side. Cheap for typical user
 * libraries (≤50 canvases); we cap at 20 canvases anyway for the rail.
 */
export async function listCanvasesWithPreviews(
  userId: string,
  opts: { limit?: number } = {},
): Promise<Canvas[]> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 20))
  const { data: headerRows, error: headerError } = await sbAdmin
    .from('canvases')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (headerError) throw headerError
  const headers = (headerRows as CanvasRow[]) || []
  if (headers.length === 0) return []

  const ids = headers.map((h) => h.id)
  const [{ data: nodeRows, error: nodeError }, { data: edgeRows, error: edgeError }] =
    await Promise.all([
      sbAdmin
        .from('canvas_nodes')
        // Minimal projection — just what the mini-graph needs. Skip the
        // heavy data_json blobs for prompt content / param objects we won't
        // render in a 88px-tall preview.
        .select('canvas_id, client_node_id, type, position_x, position_y, data_json')
        .in('canvas_id', ids),
      sbAdmin
        .from('canvas_edges')
        .select(
          'canvas_id, client_edge_id, source_client_node_id, source_handle, target_client_node_id, target_handle',
        )
        .in('canvas_id', ids),
    ])

  if (nodeError) throw nodeError
  if (edgeError) throw edgeError

  const nodesByCanvas = new Map<string, NodeRow[]>()
  for (const row of (nodeRows as NodeRow[]) || []) {
    if (!nodesByCanvas.has(row.canvas_id)) nodesByCanvas.set(row.canvas_id, [])
    nodesByCanvas.get(row.canvas_id)!.push(row)
  }
  const edgesByCanvas = new Map<string, EdgeRow[]>()
  for (const row of (edgeRows as EdgeRow[]) || []) {
    if (!edgesByCanvas.has(row.canvas_id)) edgesByCanvas.set(row.canvas_id, [])
    edgesByCanvas.get(row.canvas_id)!.push(row)
  }

  return headers.map((row) => {
    const canvas = rowToCanvasHeader(row)
    canvas.nodes = (nodesByCanvas.get(row.id) || []).map(rowToNode)
    canvas.edges = (edgesByCanvas.get(row.id) || []).map(rowToEdge)
    return canvas
  })
}

export async function createCanvas(userId: string, title?: string): Promise<Canvas> {
  const { data, error } = await sbAdmin
    .from('canvases')
    .insert({
      user_id: userId,
      title: title || 'Untitled canvas',
    })
    .select('*')
    .single()

  if (error) throw error
  return rowToCanvasHeader(data as CanvasRow)
}

export interface CanvasLoadResult {
  canvas: Canvas
  version: number
  lastEditedBySession: string | null
}

export async function getCanvas(
  canvasId: string,
  userId: string,
): Promise<CanvasLoadResult | null> {
  const { data: header, error: headerError } = await sbAdmin
    .from('canvases')
    .select('*')
    .eq('id', canvasId)
    .eq('user_id', userId)
    .maybeSingle()

  if (headerError) throw headerError
  if (!header) return null

  const [{ data: nodeRows, error: nodeError }, { data: edgeRows, error: edgeError }] =
    await Promise.all([
      sbAdmin.from('canvas_nodes').select('*').eq('canvas_id', canvasId),
      sbAdmin.from('canvas_edges').select('*').eq('canvas_id', canvasId),
    ])

  if (nodeError) throw nodeError
  if (edgeError) throw edgeError

  const row = header as CanvasRow
  const canvas = rowToCanvasHeader(row)
  canvas.nodes = (nodeRows as NodeRow[]).map(rowToNode)
  canvas.edges = (edgeRows as EdgeRow[]).map(rowToEdge)
  return {
    canvas,
    version: row.version ?? 1,
    lastEditedBySession: row.last_edited_by_session ?? null,
  }
}

// ---------------------------------------------------------------------------
// Save (diff-based, optimistic-locked)
// ---------------------------------------------------------------------------

export interface SaveCanvasOptions {
  expectedVersion?: number
  sessionId?: string | null
}

export interface SaveCanvasResult {
  newVersion: number
}

export async function saveCanvas(
  canvas: Canvas,
  userId: string,
  options: SaveCanvasOptions = {},
): Promise<SaveCanvasResult> {
  // ---- Server-side floor: max 1 save per 500ms per canvas. ------------------
  // The client debounces at 1.5s; this catches misbehaving clients and
  // multi-tab pile-ups. We use the existing in-memory rate limiter.
  const rl = rateLimit(`canvas:save:${canvas.id}`, 1, 500)
  if (!rl.success) {
    throw new SaveRateLimitedError(Math.max(0, rl.reset - Date.now()))
  }

  // ---- Load current header (ownership + version check). --------------------
  const { data: current, error: curErr } = await sbAdmin
    .from('canvases')
    .select('version,last_edited_by_session')
    .eq('id', canvas.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (curErr) throw curErr
  if (!current) {
    // Not found OR not owned. Mirror the previous behavior of failing softly
    // by treating this as a generic error — the route already handles 500.
    throw new Error('canvas_not_found_or_unauthorized')
  }

  const currentVersion = (current as { version: number }).version ?? 1
  const currentSession =
    (current as { last_edited_by_session: string | null }).last_edited_by_session ?? null

  if (
    options.expectedVersion !== undefined &&
    options.expectedVersion !== currentVersion
  ) {
    throw new VersionConflictError(currentVersion, currentSession)
  }

  // ---- Header update (trigger bumps version when fields change). -----------
  // Defensive: cap session id length and strip to text-safe chars. The client
  // generates a UUID, but a misbehaving client could send anything, and this
  // value is echoed back to *other* clients on conflict. Bounding it keeps
  // the field from being abused as a covert channel between users.
  const safeSessionId = options.sessionId
    ? String(options.sessionId).slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '')
    : null
  // Always bump version explicitly so EVERY save invalidates stale clients,
  // even when only nodes/edges changed and the header trigger would otherwise
  // skip. The trigger no-ops when we pre-set the bump (its if-clause sets
  // new.version = old.version+1, which matches what we set here when header
  // fields change; when only nodes change, the trigger's clause skips and our
  // explicit value wins).
  const headerPatch: Record<string, any> = {
    title: canvas.title,
    viewport_json: canvas.viewport,
    last_edited_by_session: safeSessionId,
    version: currentVersion + 1,
  }

  const { data: updated, error: hdrError } = await sbAdmin
    .from('canvases')
    .update(headerPatch)
    .eq('id', canvas.id)
    .eq('user_id', userId)
    .select('version')
    .single()

  if (hdrError) throw hdrError
  const newVersion = (updated as { version: number }).version ?? currentVersion + 1

  // ---- Diff + sync nodes by client_node_id. --------------------------------
  await syncNodes(canvas.id, canvas.nodes)
  // ---- Diff + sync edges by client_edge_id. --------------------------------
  await syncEdges(canvas.id, canvas.edges)

  return { newVersion }
}

async function syncNodes(canvasId: string, incoming: CanvasNode[]): Promise<void> {
  const { data: existingRaw, error } = await sbAdmin
    .from('canvas_nodes')
    .select('client_node_id, type, position_x, position_y, data_json, generation_id')
    .eq('canvas_id', canvasId)

  if (error) throw error
  const existing = (existingRaw ?? []) as Pick<
    NodeRow,
    'client_node_id' | 'type' | 'position_x' | 'position_y' | 'data_json' | 'generation_id'
  >[]
  const existingMap = new Map(existing.map((r) => [r.client_node_id, r]))
  const incomingIds = new Set(incoming.map((n) => n.id))

  // Delete removed.
  const toDelete = existing
    .map((r) => r.client_node_id)
    .filter((id) => !incomingIds.has(id))
  if (toDelete.length > 0) {
    const { error: delErr } = await sbAdmin
      .from('canvas_nodes')
      .delete()
      .eq('canvas_id', canvasId)
      .in('client_node_id', toDelete)
    if (delErr) throw delErr
  }

  // Upsert changed + insert new in a single statement.
  // We rely on the unique (canvas_id, client_node_id) constraint for upsert.
  const toUpsert: any[] = []
  for (const n of incoming) {
    const existingRow = existingMap.get(n.id)
    const nextRow = {
      canvas_id: canvasId,
      client_node_id: n.id,
      type: n.type,
      position_x: n.position.x,
      position_y: n.position.y,
      data_json: n.data,
      generation_id: n.data.generationId || null,
    }
    if (!existingRow) {
      toUpsert.push(nextRow)
      continue
    }
    if (nodeRowChanged(existingRow, nextRow)) {
      toUpsert.push(nextRow)
    }
  }

  if (toUpsert.length > 0) {
    const { error: upErr } = await sbAdmin
      .from('canvas_nodes')
      .upsert(toUpsert, { onConflict: 'canvas_id,client_node_id' })
    if (upErr) throw upErr
  }
}

async function syncEdges(canvasId: string, incoming: CanvasEdge[]): Promise<void> {
  const { data: existingRaw, error } = await sbAdmin
    .from('canvas_edges')
    .select(
      'client_edge_id, source_client_node_id, source_handle, target_client_node_id, target_handle',
    )
    .eq('canvas_id', canvasId)

  if (error) throw error
  const existing = (existingRaw ?? []) as Pick<
    EdgeRow,
    | 'client_edge_id'
    | 'source_client_node_id'
    | 'source_handle'
    | 'target_client_node_id'
    | 'target_handle'
  >[]
  const existingMap = new Map(existing.map((r) => [r.client_edge_id, r]))
  const incomingIds = new Set(incoming.map((e) => e.id))

  const toDelete = existing
    .map((r) => r.client_edge_id)
    .filter((id) => !incomingIds.has(id))
  if (toDelete.length > 0) {
    const { error: delErr } = await sbAdmin
      .from('canvas_edges')
      .delete()
      .eq('canvas_id', canvasId)
      .in('client_edge_id', toDelete)
    if (delErr) throw delErr
  }

  const toUpsert: any[] = []
  for (const e of incoming) {
    const existingRow = existingMap.get(e.id)
    const nextRow = {
      canvas_id: canvasId,
      client_edge_id: e.id,
      source_client_node_id: e.source,
      source_handle: e.sourceHandle,
      target_client_node_id: e.target,
      target_handle: e.targetHandle,
    }
    if (!existingRow) {
      toUpsert.push(nextRow)
      continue
    }
    if (edgeRowChanged(existingRow, nextRow)) {
      toUpsert.push(nextRow)
    }
  }

  if (toUpsert.length > 0) {
    const { error: upErr } = await sbAdmin
      .from('canvas_edges')
      .upsert(toUpsert, { onConflict: 'canvas_id,client_edge_id' })
    if (upErr) throw upErr
  }
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

function nodeRowChanged(
  prev: {
    type: string
    position_x: number
    position_y: number
    data_json: any
    generation_id: string | null
  },
  next: {
    type: string
    position_x: number
    position_y: number
    data_json: any
    generation_id: string | null
  },
): boolean {
  if (prev.type !== next.type) return true
  // Positions can be numeric strings coming back from PG numeric type.
  if (Number(prev.position_x) !== Number(next.position_x)) return true
  if (Number(prev.position_y) !== Number(next.position_y)) return true
  if ((prev.generation_id || null) !== (next.generation_id || null)) return true
  return !deepEqual(prev.data_json, next.data_json)
}

function edgeRowChanged(
  prev: {
    source_client_node_id: string
    source_handle: string
    target_client_node_id: string
    target_handle: string
  },
  next: {
    source_client_node_id: string
    source_handle: string
    target_client_node_id: string
    target_handle: string
  },
): boolean {
  return (
    prev.source_client_node_id !== next.source_client_node_id ||
    prev.source_handle !== next.source_handle ||
    prev.target_client_node_id !== next.target_client_node_id ||
    prev.target_handle !== next.target_handle
  )
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!deepEqual(a[k], b[k])) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteCanvas(canvasId: string, userId: string): Promise<void> {
  const { error } = await sbAdmin
    .from('canvases')
    .delete()
    .eq('id', canvasId)
    .eq('user_id', userId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Row → IR mappers
// ---------------------------------------------------------------------------

function rowToCanvasHeader(row: CanvasRow): Canvas {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    viewport: row.viewport_json || { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToNode(row: NodeRow): CanvasNode {
  return {
    id: row.client_node_id,
    type: row.type as NodeType,
    position: { x: Number(row.position_x), y: Number(row.position_y) },
    data: row.data_json || { status: 'idle' },
  }
}

function rowToEdge(row: EdgeRow): CanvasEdge {
  return {
    id: row.client_edge_id,
    source: row.source_client_node_id,
    sourceHandle: row.source_handle,
    target: row.target_client_node_id,
    targetHandle: row.target_handle,
  }
}
