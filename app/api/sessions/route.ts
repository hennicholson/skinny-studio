import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

/**
 * GET /api/sessions
 * List all sessions for the current user
 */
export async function GET(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    const { data: sessions, error } = await sbAdmin
      .from('sessions')
      .select('*')
      .eq('whop_user_id', whop.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching sessions:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (error) {
    console.error('Sessions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/sessions
 * Create a new session
 */
export async function POST(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    const body = await request.json()
    const { templateId, title, briefContext, assets } = body

    if (!templateId || !title || !assets) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: session, error } = await sbAdmin
      .from('sessions')
      .insert({
        whop_user_id: whop.id,
        template_id: templateId,
        title,
        brief_context: briefContext || null,
        assets,
        status: 'planning',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating session:', error)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    console.error('Sessions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
