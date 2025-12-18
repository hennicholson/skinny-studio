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

    const { data: campaigns, error } = await sbAdmin
      .from('credit_campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching campaigns:', error)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    // Get grant counts for each campaign
    const campaignIds = campaigns?.map(c => c.id) || []
    const { data: grantCounts } = await sbAdmin
      .from('campaign_grants')
      .select('campaign_id')
      .in('campaign_id', campaignIds)

    const grantsPerCampaign: Record<string, number> = {}
    grantCounts?.forEach(g => {
      grantsPerCampaign[g.campaign_id] = (grantsPerCampaign[g.campaign_id] || 0) + 1
    })

    const campaignsWithStats = campaigns?.map(c => ({
      ...c,
      grants_count: grantsPerCampaign[c.id] || 0
    }))

    return NextResponse.json({ campaigns: campaignsWithStats })
  } catch (error) {
    console.error('Admin campaigns error:', error)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
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
    const { name, description, credit_amount_cents, is_active, applies_to } = body

    if (!name || credit_amount_cents === undefined) {
      return NextResponse.json({ error: 'Name and credit amount are required' }, { status: 400 })
    }

    const { data: campaign, error } = await sbAdmin
      .from('credit_campaigns')
      .insert({
        name,
        description: description || null,
        credit_amount_cents: Math.round(credit_amount_cents),
        is_active: is_active ?? false,
        applies_to: applies_to || 'new_users',
        created_by: whop.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating campaign:', error)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    return NextResponse.json({ campaign })
  } catch (error) {
    console.error('Admin create campaign error:', error)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
