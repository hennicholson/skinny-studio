import { NextRequest, NextResponse } from 'next/server'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import {
  deleteCanvas,
  getCanvas,
  saveCanvas,
  SaveRateLimitedError,
  VersionConflictError,
} from '@/lib/supabase/canvas-queries'
import { Canvas } from '@/lib/canvas/ir'

export const runtime = 'nodejs'

async function resolveUserId(): Promise<string | null> {
  if (!(await hasWhopAuth())) return null
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const me = await verifyWhopTokenAndGetProfile(token, hintedId)
    return me.id
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const result = await getCanvas(params.id, userId)
    if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({
      canvas: result.canvas,
      version: result.version,
      lastEditedBySession: result.lastEditedBySession,
    })
  } catch (err) {
    console.error('[canvas:get]', err)
    return NextResponse.json({ error: 'failed to load canvas' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = (await req.json()) as {
      canvas: Canvas
      expectedVersion?: number
      sessionId?: string | null
    }
    if (!body.canvas) return NextResponse.json({ error: 'missing canvas body' }, { status: 400 })
    const canvas: Canvas = { ...body.canvas, id: params.id, userId }
    const { newVersion } = await saveCanvas(canvas, userId, {
      expectedVersion: body.expectedVersion,
      sessionId: body.sessionId ?? null,
    })
    return NextResponse.json({ ok: true, newVersion })
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return NextResponse.json(
        {
          error: 'version_conflict',
          currentVersion: err.currentVersion,
          lastEditedBySession: err.lastEditedBySession,
        },
        { status: 409 },
      )
    }
    if (err instanceof SaveRateLimitedError) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfterMs: err.retryAfterMs },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil(err.retryAfterMs / 1000).toString(),
          },
        },
      )
    }
    console.error('[canvas:save]', err)
    return NextResponse.json({ error: 'failed to save canvas' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    await deleteCanvas(params.id, userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[canvas:delete]', err)
    return NextResponse.json({ error: 'failed to delete canvas' }, { status: 500 })
  }
}
