// GET → returns whether the current user has seen the latest release.
// POST → marks the latest release as seen for this user.

import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { hasWhopAuth, getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile } from '@/lib/whop'
import { RELEASE_VERSION } from '@/lib/release-version'

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

export async function GET() {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ seen: true, version: RELEASE_VERSION })

  const { data: profile } = await sbAdmin
    .from('user_profiles')
    .select('last_seen_release_version')
    .eq('whop_user_id', userId)
    .maybeSingle()

  const seen = profile?.last_seen_release_version === RELEASE_VERSION
  return NextResponse.json({ seen, version: RELEASE_VERSION })
}

export async function POST() {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 })

  const { error } = await sbAdmin
    .from('user_profiles')
    .update({ last_seen_release_version: RELEASE_VERSION })
    .eq('whop_user_id', userId)

  if (error) {
    console.error('[whats-new] mark seen failed', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
