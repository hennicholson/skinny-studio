import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

// POST /api/storyboards/[id]/shots/reorder - Reorder shots
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    // Verify ownership
    const { data: storyboard } = await sbAdmin
      .from('storyboards')
      .select('id')
      .eq('id', id)
      .eq('whop_user_id', whop.id)
      .single()

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const { orderedIds } = await request.json()

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 })
    }

    // Update sort_order and shot_number for each shot
    const updatePromises = orderedIds.map((shotId, index) =>
      sbAdmin
        .from('storyboard_shots')
        .update({
          sort_order: index,
          shot_number: index + 1,
        })
        .eq('id', shotId)
        .eq('storyboard_id', id)
    )

    await Promise.all(updatePromises)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reorder API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
