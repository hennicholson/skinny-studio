import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { isAdmin } from '@/lib/admin'

export async function GET() {
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

    const { data: models, error } = await sbAdmin
      .from('studio_models')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching models:', error)
      return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
    }

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Admin models error:', error)
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
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

    // Get the highest sort_order
    const { data: maxSort } = await sbAdmin
      .from('studio_models')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const newSortOrder = (maxSort?.sort_order || 0) + 1

    const { data: model, error } = await sbAdmin
      .from('studio_models')
      .insert({
        ...body,
        sort_order: body.sort_order ?? newSortOrder,
        is_active: body.is_active ?? true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating model:', error)
      return NextResponse.json({ error: 'Failed to create model' }, { status: 500 })
    }

    return NextResponse.json({ model })
  } catch (error) {
    console.error('Admin create model error:', error)
    return NextResponse.json({ error: 'Failed to create model' }, { status: 500 })
  }
}
