import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { isAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')

    const { data: gifts, error } = await sbAdmin
      .from('credit_gifts')
      .select(`
        *,
        recipient:user_profiles!recipient_user_id (
          id,
          username,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching gifts:', error)
      return NextResponse.json({ error: 'Failed to fetch gifts' }, { status: 500 })
    }

    return NextResponse.json({ gifts })
  } catch (error) {
    console.error('Admin gifts error:', error)
    return NextResponse.json({ error: 'Failed to fetch gifts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { recipient_user_id, amount_cents, message } = body

    if (!recipient_user_id || !amount_cents) {
      return NextResponse.json({ error: 'Recipient and amount are required' }, { status: 400 })
    }

    // Verify recipient exists
    const { data: recipient, error: recipientError } = await sbAdmin
      .from('user_profiles')
      .select('id, username, balance_cents')
      .eq('id', recipient_user_id)
      .single()

    if (recipientError || !recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }

    // Create the gift record
    const { data: gift, error: giftError } = await sbAdmin
      .from('credit_gifts')
      .insert({
        recipient_user_id,
        amount_cents: Math.round(amount_cents),
        message: message || null,
        sent_by: whop.id
      })
      .select()
      .single()

    if (giftError) {
      console.error('Error creating gift:', giftError)
      return NextResponse.json({ error: 'Failed to create gift' }, { status: 500 })
    }

    // Immediately credit the user's balance (they can still see the gift animation)
    const newBalance = recipient.balance_cents + Math.round(amount_cents)
    const { error: updateError } = await sbAdmin
      .from('user_profiles')
      .update({ balance_cents: newBalance })
      .eq('id', recipient_user_id)

    if (updateError) {
      console.error('Error updating recipient balance:', updateError)
      // Don't fail the request, the gift was created
    }

    return NextResponse.json({
      gift,
      recipient: {
        id: recipient.id,
        username: recipient.username,
        new_balance_cents: newBalance
      }
    })
  } catch (error) {
    console.error('Admin send gift error:', error)
    return NextResponse.json({ error: 'Failed to send gift' }, { status: 500 })
  }
}
