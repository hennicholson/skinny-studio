// Admin-only endpoint that fires a Whop push announcing a new model.
// Triggers a broadcast to every user with a whop_unique_id in user_profiles.
// The push deep-links to /canvas?model=<slug> so a tap lands the user on a
// fresh canvas pre-filtered to that model.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { broadcastToAllUsers } from '@/lib/whop-notifications'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

async function isAdmin(): Promise<boolean> {
  if (!(await hasWhopAuth())) return false
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const me = await verifyWhopTokenAndGetProfile(token, hintedId)
    const { data: profile } = await sbAdmin
      .from('user_profiles')
      .select('is_admin')
      .eq('whop_user_id', me.id)
      .maybeSingle()
    return !!profile?.is_admin
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: {
    modelSlug?: string
    modelName?: string
    hook?: string
    title?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.modelName) {
    return NextResponse.json({ error: 'modelName is required' }, { status: 400 })
  }

  const title = body.title ?? `New model live: ${body.modelName}`
  const content = body.hook ?? `Try the new ${body.modelName} in Canvas now.`
  const deepLinkPath = body.modelSlug ? `/canvas?model=${encodeURIComponent(body.modelSlug)}` : '/canvas'

  const result = await broadcastToAllUsers({ title, content, deepLinkPath })
  return NextResponse.json({ ok: true, ...result })
}
