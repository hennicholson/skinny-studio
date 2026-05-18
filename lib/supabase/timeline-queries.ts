// Canvas timeline persistence layer.
//
// Translates between the in-memory Timeline IR (lib/timeline/ir.ts) and the
// canvas_timelines / canvas_timeline_uploads tables. Mirrors the style of
// lib/supabase/canvas-queries.ts: server-side only (sbAdmin), Whop auth
// performed upstream in the API route.
//
// Storage contract:
//   • The full Timeline IR (tracks, clips, uploads, fps, width, height) is
//     stored as a single jsonb blob on canvas_timelines.document.
//   • duration_seconds / last_rendered_url / last_rendered_at / render_status
//     live as top-level columns so we can query/aggregate without parsing
//     JSON. The server recomputes duration_seconds on every upsert from the
//     incoming tracks; it never trusts the client's value (the IR's
//     durationSeconds field is "convenience", not source of truth).
//   • Uploads have their own row in canvas_timeline_uploads so we can list,
//     dedupe, and (eventually) garbage-collect them independently of the
//     timeline doc lifecycle. The doc still carries an inlined `uploads`
//     array for fast client rehydration.

import { sbAdmin } from '@/lib/supabaseAdmin'
import {
  Timeline,
  TimelineClip,
  TimelineTrack,
  TimelineUpload,
  computeTimelineDuration,
  emptyTimelineDocument,
} from '@/lib/timeline/ir'

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface CanvasTimelineRow {
  id: string
  canvas_id: string
  user_id: string
  document: Partial<Timeline> & {
    tracks?: TimelineTrack[]
    clips?: TimelineClip[]
    uploads?: TimelineUpload[]
  }
  duration_seconds: number | string
  last_rendered_url: string | null
  last_rendered_at: string | null
  render_status: 'idle' | 'rendering' | 'failed'
  created_at: string
  updated_at: string
}

interface CanvasTimelineUploadRow {
  id: string
  timeline_id: string
  user_id: string
  storage_path: string
  filename: string | null
  content_type: string | null
  duration_seconds: number | string | null
  size_bytes: number | string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Fetch the timeline document for a canvas, scoped to the owning user.
 * Returns null when no timeline row exists yet (caller should create one,
 * typically via upsertTimeline with an empty doc).
 */
export async function getTimeline(
  canvasId: string,
  userId: string,
): Promise<Timeline | null> {
  const { data, error } = await sbAdmin
    .from('canvas_timelines')
    .select('*')
    .eq('canvas_id', canvasId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return rowToTimeline(data as CanvasTimelineRow)
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Upsert the timeline document for a canvas. Verifies the user owns the
 * parent canvas before writing.
 *
 * The client typically sends the whole document on a debounced save; we
 * accept a Partial<Timeline> so a caller can patch just one field (e.g.
 * fps, width) without re-sending the entire tracks array. When tracks are
 * provided, we recompute durationSeconds from them; otherwise we keep the
 * existing value (or 0 for a fresh row).
 */
export async function upsertTimeline(
  canvasId: string,
  userId: string,
  doc: Partial<Timeline>,
): Promise<Timeline> {
  // ---- Ownership: ensure the parent canvas belongs to this user. ----------
  const { data: canvas, error: canvasErr } = await sbAdmin
    .from('canvases')
    .select('id, user_id')
    .eq('id', canvasId)
    .eq('user_id', userId)
    .maybeSingle()

  if (canvasErr) throw canvasErr
  if (!canvas) throw new Error('canvas_not_found_or_unauthorized')

  // ---- Load existing row (if any) so we can merge the partial doc. --------
  const { data: existingRaw, error: existingErr } = await sbAdmin
    .from('canvas_timelines')
    .select('*')
    .eq('canvas_id', canvasId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingErr) throw existingErr
  const existing = existingRaw as CanvasTimelineRow | null

  const existingDoc = existing?.document ?? {}

  // ---- Merge incoming partial over existing doc. --------------------------
  // We strip server-managed fields (id, canvasId, createdAt, updatedAt) and
  // the column-promoted fields (durationSeconds, lastRendered*, renderStatus)
  // out of the jsonb blob so the row columns remain the source of truth.
  const {
    id: _ignoredId,
    canvasId: _ignoredCanvasId,
    createdAt: _ignoredCreatedAt,
    updatedAt: _ignoredUpdatedAt,
    durationSeconds: incomingDurationSeconds,
    lastRenderedUrl: incomingLastRenderedUrl,
    lastRenderedAt: incomingLastRenderedAt,
    renderStatus: incomingRenderStatus,
    ...incomingDocBody
  } = doc

  const mergedDocBody: Partial<Timeline> = {
    ...(existingDoc as Partial<Timeline>),
    ...incomingDocBody,
  }

  // ---- Recompute durationSeconds from authoritative clips. ----------------
  // The client's durationSeconds is advisory; we never trust it. If the
  // caller didn't send clips, fall back to the existing row's stored value.
  const clips = (mergedDocBody.clips as TimelineClip[] | undefined) ?? []
  const computedDuration = mergedDocBody.clips
    ? computeTimelineDuration(clips)
    : Number(existing?.duration_seconds ?? 0) || 0

  // ---- Resolve render-state columns. --------------------------------------
  // Render fields are persisted only via recordRender() in the normal flow;
  // we still accept them through upsertTimeline so the client can flip
  // renderStatus to 'rendering' / 'failed' for UI feedback during a browser
  // render. Validate render_status to the allowed enum.
  const safeRenderStatus: 'idle' | 'rendering' | 'failed' =
    incomingRenderStatus === 'rendering' ||
    incomingRenderStatus === 'failed' ||
    incomingRenderStatus === 'idle'
      ? incomingRenderStatus
      : (existing?.render_status ?? 'idle')

  const safeLastRenderedUrl =
    incomingLastRenderedUrl !== undefined
      ? incomingLastRenderedUrl
      : existing?.last_rendered_url ?? null

  const safeLastRenderedAt =
    incomingLastRenderedAt !== undefined
      ? incomingLastRenderedAt
      : existing?.last_rendered_at ?? null

  const rowPatch = {
    canvas_id: canvasId,
    user_id: userId,
    document: mergedDocBody,
    duration_seconds: computedDuration,
    last_rendered_url: safeLastRenderedUrl,
    last_rendered_at: safeLastRenderedAt,
    render_status: safeRenderStatus,
  }

  // ---- Upsert by canvas_id (unique). --------------------------------------
  const { data: saved, error: saveErr } = await sbAdmin
    .from('canvas_timelines')
    .upsert(rowPatch, { onConflict: 'canvas_id' })
    .select('*')
    .single()

  if (saveErr) throw saveErr
  return rowToTimeline(saved as CanvasTimelineRow)
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/**
 * Record a completed user upload. Returns the TimelineUpload shape the
 * client should add to timeline.uploads (via a subsequent upsertTimeline
 * call). The signed-upload URL is created in the route handler; this
 * function only records metadata after the bytes have landed in storage.
 */
export async function addUpload(
  timelineId: string,
  userId: string,
  upload: Omit<TimelineUpload, 'id'> & { storagePath: string },
): Promise<TimelineUpload> {
  // ---- Ownership: ensure timeline belongs to this user. -------------------
  const { data: timeline, error: tErr } = await sbAdmin
    .from('canvas_timelines')
    .select('id')
    .eq('id', timelineId)
    .eq('user_id', userId)
    .maybeSingle()

  if (tErr) throw tErr
  if (!timeline) throw new Error('timeline_not_found_or_unauthorized')

  const { data, error } = await sbAdmin
    .from('canvas_timeline_uploads')
    .insert({
      timeline_id: timelineId,
      user_id: userId,
      storage_path: upload.storagePath,
      filename: upload.filename,
      content_type: upload.contentType,
      duration_seconds: upload.durationSeconds,
      size_bytes: upload.sizeBytes,
    })
    .select('*')
    .single()

  if (error) throw error
  const row = data as CanvasTimelineUploadRow
  return {
    id: row.id,
    url: upload.url,
    filename: row.filename ?? upload.filename,
    contentType: row.content_type ?? upload.contentType,
    durationSeconds: Number(row.duration_seconds ?? upload.durationSeconds) || 0,
    sizeBytes: Number(row.size_bytes ?? upload.sizeBytes) || 0,
  }
}

// ---------------------------------------------------------------------------
// Renders
// ---------------------------------------------------------------------------

/**
 * Record a successful browser-side render. Updates last_rendered_url +
 * last_rendered_at and resets render_status to 'idle'. The actual MP4 bytes
 * have already been uploaded to the canvas-renders bucket by the route
 * handler.
 */
export async function recordRender(
  timelineId: string,
  userId: string,
  url: string,
): Promise<void> {
  const { error } = await sbAdmin
    .from('canvas_timelines')
    .update({
      last_rendered_url: url,
      last_rendered_at: new Date().toISOString(),
      render_status: 'idle',
    })
    .eq('id', timelineId)
    .eq('user_id', userId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Convenience: load-or-create
// ---------------------------------------------------------------------------

/**
 * Returns the timeline for a canvas, creating an empty row if none exists.
 * Useful for the GET handler so the client always gets a 200 with a usable
 * doc rather than having to handle a 404 + follow-up create.
 *
 * NOTE: not currently used by the GET route (which returns 404 per the
 * contract), but exported for the UI agent to call if they prefer
 * load-or-create semantics later without another round-trip.
 */
export async function getOrCreateTimeline(
  canvasId: string,
  userId: string,
): Promise<Timeline> {
  const existing = await getTimeline(canvasId, userId)
  if (existing) return existing
  return upsertTimeline(canvasId, userId, emptyTimelineDocument(canvasId))
}

// ---------------------------------------------------------------------------
// Row → IR mapper
// ---------------------------------------------------------------------------

function rowToTimeline(row: CanvasTimelineRow): Timeline {
  const doc = (row.document || {}) as Partial<Timeline>
  return {
    id: row.id,
    canvasId: row.canvas_id,
    tracks: (doc.tracks as TimelineTrack[] | undefined) ?? [],
    clips: (doc.clips as TimelineClip[] | undefined) ?? [],
    uploads: (doc.uploads as TimelineUpload[] | undefined) ?? [],
    fps: (doc.fps as Timeline['fps']) ?? 30,
    width: (doc.width as Timeline['width']) ?? 1920,
    height: (doc.height as Timeline['height']) ?? 1080,
    durationSeconds: Number(row.duration_seconds ?? 0) || 0,
    lastRenderedUrl: row.last_rendered_url ?? undefined,
    lastRenderedAt: row.last_rendered_at ?? undefined,
    renderStatus: row.render_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
