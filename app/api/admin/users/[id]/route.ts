import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { isAdmin } from '@/lib/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop || !isAdmin(whop.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = params

    const { data: user, error } = await sbAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get generation count
    const { count: generationCount } = await sbAdmin
      .from('generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_profile_id', id)

    // Get recent generations
    const { data: recentGenerations } = await sbAdmin
      .from('generations')
      .select('id, created_at, model_id, cost_cents')
      .eq('user_profile_id', id)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      user: {
        ...user,
        generation_count: generationCount || 0
      },
      recentGenerations: recentGenerations || []
    })
  } catch (error) {
    console.error('Admin get user error:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop || !isAdmin(whop.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = params
    const body = await request.json()

    // Only allow updating certain fields
    const allowedFields = ['balance_cents', 'lifetime_access']
    const updates: Record<string, any> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: user, error } = await sbAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating user:', error)
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Admin update user error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
