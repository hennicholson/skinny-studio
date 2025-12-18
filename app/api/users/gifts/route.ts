import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'

// Get pending (unclaimed) gifts for the current user
export async function GET(request: NextRequest) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await sbAdmin
      .from('user_profiles')
      .select('id')
      .eq('whop_user_id', whop.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ gifts: [] })
    }

    // Get unclaimed gifts
    const { data: gifts, error } = await sbAdmin
      .from('credit_gifts')
      .select('*')
      .eq('recipient_user_id', profile.id)
      .is('claimed_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching gifts:', error)
      return NextResponse.json({ error: 'Failed to fetch gifts' }, { status: 500 })
    }

    return NextResponse.json({ gifts: gifts || [] })
  } catch (error) {
    console.error('User gifts error:', error)
    return NextResponse.json({ error: 'Failed to fetch gifts' }, { status: 500 })
  }
}

// Claim a gift (mark as seen)
export async function POST(request: NextRequest) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { gift_id } = body

    if (!gift_id) {
      return NextResponse.json({ error: 'Gift ID is required' }, { status: 400 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await sbAdmin
      .from('user_profiles')
      .select('id')
      .eq('whop_user_id', whop.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Mark gift as claimed (only if it belongs to this user)
    const { data: gift, error } = await sbAdmin
      .from('credit_gifts')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', gift_id)
      .eq('recipient_user_id', profile.id)
      .is('claimed_at', null)
      .select()
      .single()

    if (error) {
      console.error('Error claiming gift:', error)
      return NextResponse.json({ error: 'Failed to claim gift' }, { status: 500 })
    }

    return NextResponse.json({ gift })
  } catch (error) {
    console.error('Claim gift error:', error)
    return NextResponse.json({ error: 'Failed to claim gift' }, { status: 500 })
  }
}
