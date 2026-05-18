// POST /api/canvas/[id]/timeline/render
//
// Receives a final rendered MP4 from the browser (FFmpeg.wasm) and stores it
// in the canvas-renders bucket. Uses a two-call signed-upload flow to keep
// large MP4 bodies off our serverless function (Netlify/Vercel function
// payload limits are typically 4-6MB; even short timeline renders blow past
// that).
//
// Flow:
//   1. Client POSTs { action: 'sign' } → we mint a signed upload URL at
//      canvas-renders/{user_id}/{timeline_id}-{timestamp}.mp4 and return it.
//   2. Client PUTs the MP4 bytes directly to that URL.
//   3. Client POSTs { action: 'finalize', storagePath } → we verify the
//      object exists, compute its public URL (canvas-renders is public),
//      stamp canvas_timelines.last_rendered_url/at, and return the URL.
//
// We accept ONLY these two action strings; any other body shape is a 400.

import { NextRequest, NextResponse } from 'next/server'
import {
  getWhopAuthFromHeaders,
  hasWhopAuth,
  verifyWhopTokenAndGetProfile,
} from '@/lib/whop'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { recordRender } from '@/lib/supabase/timeline-queries'

export const runtime = 'nodejs'

const BUCKET = 'canvas-renders'

interface SignBody {
  action: 'sign'
  contentType?: string  // default 'video/mp4'
}
interface FinalizeBody {
  action: 'finalize'
  storagePath: string
}
type RenderBody = SignBody | FinalizeBody

async function resolveUserAndTimeline(canvasId: string): Promise<{
  userId: string
  timelineId: string
} | null> {
  if (!(await hasWhopAuth())) return null
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const me = await verifyWhopTokenAndGetProfile(token, hintedId)
    if (!me?.id) return null

    const { data: timeline, error } = await sbAdmin
      .from('canvas_timelines')
      .select('id')
      .eq('canvas_id', canvasId)
      .eq('user_id', me.id)
      .maybeSingle()
    if (error) throw error
    if (!timeline) return null

    return { userId: me.id, timelineId: (timeline as { id: string }).id }
  } catch (err) {
    console.error('[timeline:render:auth]', err)
    return null
  }
}

function publicUrlFor(storagePath: string): string {
  const { data } = sbAdmin.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveUserAndTimeline(params.id)
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: RenderBody
  try {
    body = (await req.json()) as RenderBody
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || !('action' in body)) {
    return NextResponse.json({ error: 'missing action' }, { status: 400 })
  }

  // -------------------------------------------------------------------------
  // Phase 1: sign — return a signed upload URL for the client's PUT.
  // -------------------------------------------------------------------------
  if (body.action === 'sign') {
    const contentType = (body.contentType || 'video/mp4').toLowerCase()
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(contentType)) {
      return NextResponse.json(
        { error: 'unsupported contentType', contentType },
        { status: 415 },
      )
    }

    const stamp = Date.now()
    const storagePath = `${ctx.userId}/${ctx.timelineId}-${stamp}.mp4`

    const { data, error } = await sbAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath)
    if (error || !data) {
      console.error('[timeline:render:sign]', error)
      return NextResponse.json(
        { error: 'failed to create signed upload url' },
        { status: 500 },
      )
    }

    // Flip render_status to 'rendering' so other tabs / the UI see the
    // in-progress state. We reset to 'idle' on finalize. (If the client
    // never finalizes, render_status stays 'rendering' until the next save
    // resets it — acceptable for v0; the UI agent can patch via PUT
    // /timeline if they want crash recovery.)
    const { error: statusErr } = await sbAdmin
      .from('canvas_timelines')
      .update({ render_status: 'rendering' })
      .eq('id', ctx.timelineId)
      .eq('user_id', ctx.userId)
    if (statusErr) {
      console.warn('[timeline:render:sign] status update failed', statusErr)
    }

    return NextResponse.json({
      action: 'sign',
      bucket: BUCKET,
      storagePath,
      signedUrl: data.signedUrl,
      token: data.token,
      contentType,
    })
  }

  // -------------------------------------------------------------------------
  // Phase 2: finalize — verify upload landed, record URL, return public URL.
  // -------------------------------------------------------------------------
  if (body.action === 'finalize') {
    const storagePath = (body.storagePath || '').trim()
    if (!storagePath) {
      return NextResponse.json({ error: 'missing storagePath' }, { status: 400 })
    }

    const firstSegment = storagePath.split('/')[0]
    if (firstSegment !== ctx.userId) {
      return NextResponse.json(
        { error: 'storagePath outside user prefix' },
        { status: 403 },
      )
    }

    // Confirm the bytes actually landed before we record the URL.
    const parent = storagePath.slice(0, storagePath.lastIndexOf('/'))
    const leaf = storagePath.slice(storagePath.lastIndexOf('/') + 1)
    const { data: listed, error: listErr } = await sbAdmin.storage
      .from(BUCKET)
      .list(parent, { limit: 1000, search: leaf })
    if (listErr) {
      console.error('[timeline:render:finalize:list]', listErr)
      // Mark the timeline as failed so the UI can surface the error.
      await sbAdmin
        .from('canvas_timelines')
        .update({ render_status: 'failed' })
        .eq('id', ctx.timelineId)
        .eq('user_id', ctx.userId)
      return NextResponse.json(
        { error: 'failed to verify render upload' },
        { status: 500 },
      )
    }
    const found = (listed || []).find((o) => o.name === leaf)
    if (!found) {
      await sbAdmin
        .from('canvas_timelines')
        .update({ render_status: 'failed' })
        .eq('id', ctx.timelineId)
        .eq('user_id', ctx.userId)
      return NextResponse.json(
        { error: 'render not found in storage' },
        { status: 404 },
      )
    }

    const url = publicUrlFor(storagePath)
    try {
      await recordRender(ctx.timelineId, ctx.userId, url)
    } catch (err) {
      console.error('[timeline:render:finalize:record]', err)
      return NextResponse.json(
        { error: 'failed to record render' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      action: 'finalize',
      url,
      storagePath,
      bucket: BUCKET,
    })
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 })
}
