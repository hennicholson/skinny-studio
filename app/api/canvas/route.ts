import { NextRequest, NextResponse } from 'next/server'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import {
  createCanvas,
  listCanvases,
  listCanvasesWithPreviews,
  saveCanvas,
} from '@/lib/supabase/canvas-queries'
import { buildTemplate, CanvasTemplate } from '@/lib/canvas/templates'

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

export async function GET(req: NextRequest) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    // Opt-in `?withPreviews=1` fetches nodes + edges inline so the landing
    // page's mini-graph thumbnails can render without N+1 round-trips.
    // Default is the cheap header-only list to preserve the prior contract.
    const withPreviews = req.nextUrl.searchParams.get('withPreviews') === '1'
    const canvases = withPreviews
      ? await listCanvasesWithPreviews(userId, { limit: 20 })
      : await listCanvases(userId)
    return NextResponse.json({ canvases })
  } catch (err) {
    console.error('[canvas:list]', err)
    return NextResponse.json({ error: 'failed to list canvases' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const template: CanvasTemplate = body.template || 'blank'
    const canvas = await createCanvas(userId, body.title)

    // If a starter template was requested, seed the graph immediately so the
    // user lands in an editor that's already wired and ready to run.
    if (template !== 'blank') {
      const { nodes, edges } = buildTemplate(template)
      if (nodes.length > 0) {
        await saveCanvas({ ...canvas, nodes, edges }, userId)
        canvas.nodes = nodes
        canvas.edges = edges
      }
    }

    return NextResponse.json({ canvas })
  } catch (err) {
    console.error('[canvas:create]', err)
    return NextResponse.json({ error: 'failed to create canvas' }, { status: 500 })
  }
}
