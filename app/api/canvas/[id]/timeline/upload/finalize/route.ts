// POST /api/canvas/[id]/timeline/upload/finalize
//
// Second leg of the upload flow. After the client PUTs file bytes to the
// signed upload URL minted by /upload, it probes the file's duration with
// HTMLMediaElement and POSTs here with:
//   { storagePath, filename, contentType, durationSeconds, sizeBytes }
//
// We:
//   1. Re-verify the storagePath starts with `{userId}/` (so a malicious
//      client can't claim ownership of another user's upload).
//   2. HEAD the object to confirm the bytes actually landed.
//   3. Insert a canvas_timeline_uploads row.
//   4. Return a TimelineUpload (with a public-ish URL or signed download URL)
//      for the client to add to timeline.uploads.
//
// The bucket is private (canvas-timeline-uploads is authenticated-read), so
// we issue a long-lived signed URL for playback in the browser. The client
// can cache that URL alongside the upload metadata.

import { NextRequest, NextResponse } from 'next/server'
import {
  getWhopAuthFromHeaders,
  hasWhopAuth,
  verifyWhopTokenAndGetProfile,
} from '@/lib/whop'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { addUpload } from '@/lib/supabase/timeline-queries'

export const runtime = 'nodejs'

const BUCKET = 'canvas-timeline-uploads'
// 7 days. Long enough that the client can cache the URL in localStorage for
// editing sessions across days; short enough to avoid leaking permanent
// links via the timeline doc.
const SIGNED_URL_EXPIRES_SECONDS = 60 * 60 * 24 * 7

interface FinalizeBody {
  storagePath?: string
  filename?: string
  contentType?: string
  durationSeconds?: number
  sizeBytes?: number
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

    const { data: timeline, error: tErr } = await sbAdmin
      .from('canvas_timelines')
      .select('id')
      .eq('canvas_id', canvasId)
      .eq('user_id', me.id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!timeline) return null

    return { userId: me.id, timelineId: (timeline as { id: string }).id }
  } catch (err) {
    console.error('[timeline:upload:finalize:auth]', err)
    return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveUserAndTimeline(params.id)
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: FinalizeBody
  try {
    body = (await req.json()) as FinalizeBody
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  const storagePath = (body.storagePath || '').trim()
  if (!storagePath) {
    return NextResponse.json({ error: 'missing storagePath' }, { status: 400 })
  }

  // ---- Guard: path must live under the user's prefix. ---------------------
  const firstSegment = storagePath.split('/')[0]
  if (firstSegment !== ctx.userId) {
    return NextResponse.json(
      { error: 'storagePath outside user prefix' },
      { status: 403 },
    )
  }

  // ---- Verify the file actually exists in storage. ------------------------
  // createSignedUrl will succeed even for objects that don't exist, so we
  // explicitly stat via .list with a prefix match on the parent folder.
  const parent = storagePath.slice(0, storagePath.lastIndexOf('/'))
  const leaf = storagePath.slice(storagePath.lastIndexOf('/') + 1)
  const { data: listed, error: listErr } = await sbAdmin.storage
    .from(BUCKET)
    .list(parent, { limit: 1000, search: leaf })
  if (listErr) {
    console.error('[timeline:upload:finalize:list]', listErr)
    return NextResponse.json({ error: 'failed to verify upload' }, { status: 500 })
  }
  const found = (listed || []).find((o) => o.name === leaf)
  if (!found) {
    return NextResponse.json(
      { error: 'upload not found in storage' },
      { status: 404 },
    )
  }

  // Defensive: prefer the storage-reported size over the client's claim.
  const sizeBytes =
    typeof (found as { metadata?: { size?: number } }).metadata?.size === 'number'
      ? (found as { metadata?: { size?: number } }).metadata!.size!
      : Number(body.sizeBytes ?? 0) || 0

  const durationSeconds = Number(body.durationSeconds ?? 0) || 0
  const filename = (body.filename || leaf).slice(0, 200)
  const contentType = (body.contentType || 'application/octet-stream').slice(0, 100)

  // ---- Issue a signed download URL for playback in the browser. -----------
  const { data: signed, error: signErr } = await sbAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_SECONDS)
  if (signErr || !signed?.signedUrl) {
    console.error('[timeline:upload:finalize:sign]', signErr)
    return NextResponse.json(
      { error: 'failed to create signed playback url' },
      { status: 500 },
    )
  }

  // ---- Insert the upload row. ---------------------------------------------
  try {
    const upload = await addUpload(ctx.timelineId, ctx.userId, {
      url: signed.signedUrl,
      filename,
      contentType,
      durationSeconds,
      sizeBytes,
      storagePath,
    })
    return NextResponse.json({ upload })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    if (msg === 'timeline_not_found_or_unauthorized') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    console.error('[timeline:upload:finalize]', err)
    return NextResponse.json(
      { error: 'failed to finalize upload' },
      { status: 500 },
    )
  }
}
