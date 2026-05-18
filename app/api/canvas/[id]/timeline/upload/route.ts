// POST /api/canvas/[id]/timeline/upload
//
// Two-phase upload flow:
//   1. Client POSTs { filename, contentType } here. We mint a UUID for the
//      upload, build the storage path {user_id}/{upload_id}-{safe_filename},
//      and return a signed upload URL.
//   2. Client PUTs the file bytes directly to Storage at that URL, probes
//      its duration with HTMLMediaElement, then POSTs to /upload/finalize
//      with the durationSeconds + sizeBytes so we can record the metadata
//      row and return a TimelineUpload for the client to inline into
//      timeline.uploads.
//
// We do NOT trust the storagePath the client sends back to /finalize — it's
// echoed from this response, but the finalize route re-verifies that the
// path lives under the user's prefix in canvas-timeline-uploads.
//
// Response includes the upload_id so the client can supply it in the
// finalize call without re-deriving it from storagePath.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  getWhopAuthFromHeaders,
  hasWhopAuth,
  verifyWhopTokenAndGetProfile,
} from '@/lib/whop'
import { sbAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const BUCKET = 'canvas-timeline-uploads'

// Allowed media types — mirror the migration's allowed_mime_types on the
// canvas-timeline-uploads bucket. Belt-and-suspenders since Storage will
// also reject non-allowed MIME types at PUT time.
const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
  'audio/mp4',
])

interface InitiateBody {
  filename?: string
  contentType?: string
}

async function resolveUserAndTimeline(canvasId: string): Promise<{
  userId: string
  timelineId: string
} | null> {
  if (!(await hasWhopAuth())) return null
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const me = await verifyWhopTokenAndGetProfile(token, hintedId)
    if (!me?.id) return null

    // Ensure the timeline row exists. We don't auto-create here because the
    // PUT /timeline route is the canonical create path; if the client hits
    // upload before any save, we still mint a timeline so the upload has a
    // valid parent. (Otherwise the client would be forced to PUT an empty
    // doc first just to upload an asset.)
    const { data: existing, error: getErr } = await sbAdmin
      .from('canvas_timelines')
      .select('id, user_id, canvas_id')
      .eq('canvas_id', canvasId)
      .eq('user_id', me.id)
      .maybeSingle()
    if (getErr) throw getErr

    if (existing) {
      return { userId: me.id, timelineId: (existing as { id: string }).id }
    }

    // Verify canvas ownership before creating a timeline.
    const { data: canvas, error: cErr } = await sbAdmin
      .from('canvases')
      .select('id')
      .eq('id', canvasId)
      .eq('user_id', me.id)
      .maybeSingle()
    if (cErr) throw cErr
    if (!canvas) return null

    const { data: created, error: cInsertErr } = await sbAdmin
      .from('canvas_timelines')
      .insert({
        canvas_id: canvasId,
        user_id: me.id,
        document: {},
        duration_seconds: 0,
      })
      .select('id')
      .single()
    if (cInsertErr) throw cInsertErr

    return { userId: me.id, timelineId: (created as { id: string }).id }
  } catch (err) {
    console.error('[timeline:upload:auth]', err)
    return null
  }
}

// Reduce a user-supplied filename to a path-safe slug. We keep the extension
// so MIME sniffing by player elements still works (e.g., Safari prefers .mov).
function safeFilename(input: string | undefined): string {
  const name = (input || 'upload').trim()
  // Split off extension (last dot, keep up to 8 chars).
  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext = lastDot > 0 ? name.slice(lastDot + 1, lastDot + 1 + 8) : ''
  const safeBase = base
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'upload'
  const safeExt = ext.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveUserAndTimeline(params.id)
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: InitiateBody
  try {
    body = (await req.json()) as InitiateBody
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  const contentType = (body.contentType || '').toLowerCase()
  if (!contentType) {
    return NextResponse.json({ error: 'missing contentType' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: 'unsupported contentType', contentType },
      { status: 415 },
    )
  }

  const uploadId = randomUUID()
  const filename = safeFilename(body.filename)
  // Path convention: {user_id}/{upload_id}-{filename}
  // The leading {user_id} segment is what the storage.objects RLS policy
  // checks against auth.uid().
  const storagePath = `${ctx.userId}/${uploadId}-${filename}`

  const { data, error } = await sbAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    console.error('[timeline:upload:sign]', error)
    return NextResponse.json(
      { error: 'failed to create signed upload url' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    uploadId,
    timelineId: ctx.timelineId,
    bucket: BUCKET,
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
    // The client should set Content-Type on its PUT to match what they
    // declared here; Storage will reject a mismatch against allowed_mime_types.
    contentType,
  })
}
