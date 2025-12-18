import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { verifyWhopTokenAndGetProfile, getWhopAuthFromHeaders, hasWhopAuth } from '@/lib/whop'

export const runtime = 'nodejs'

// GET /api/storyboards - List user's storyboards
export async function GET(request: Request) {
  try {
    // Verify auth
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    // Fetch storyboards
    const { data: storyboards, error } = await sbAdmin
      .from('storyboards')
      .select(`
        id,
        whop_user_id,
        title,
        description,
        genre,
        mood,
        style_notes,
        conversation_id,
        default_aspect_ratio,
        default_model_slug,
        status,
        total_shots,
        completed_shots,
        created_at,
        updated_at
      `)
      .eq('whop_user_id', whop.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching storyboards:', error)
      return NextResponse.json({ error: 'Failed to fetch storyboards' }, { status: 500 })
    }

    // Transform to camelCase
    const transformed = (storyboards || []).map(sb => ({
      id: sb.id,
      whopUserId: sb.whop_user_id,
      title: sb.title,
      description: sb.description,
      genre: sb.genre,
      mood: sb.mood,
      styleNotes: sb.style_notes,
      conversationId: sb.conversation_id,
      defaultAspectRatio: sb.default_aspect_ratio,
      defaultModelSlug: sb.default_model_slug,
      status: sb.status,
      totalShots: sb.total_shots,
      completedShots: sb.completed_shots,
      createdAt: sb.created_at,
      updatedAt: sb.updated_at,
    }))

    return NextResponse.json({ storyboards: transformed })
  } catch (error) {
    console.error('Storyboards API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/storyboards - Create a new storyboard
export async function POST(request: Request) {
  try {
    // Verify auth
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    const body = await request.json()
    const {
      title = 'Untitled Storyboard',
      description,
      genre,
      mood,
      styleNotes,
      defaultAspectRatio = '16:9',
      defaultModelSlug = 'seedream-4.5',
    } = body

    // Create storyboard
    const { data: storyboard, error } = await sbAdmin
      .from('storyboards')
      .insert({
        whop_user_id: whop.id,
        title,
        description,
        genre,
        mood,
        style_notes: styleNotes,
        default_aspect_ratio: defaultAspectRatio,
        default_model_slug: defaultModelSlug,
        status: 'planning',
        total_shots: 0,
        completed_shots: 0,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating storyboard:', error)
      return NextResponse.json({ error: 'Failed to create storyboard' }, { status: 500 })
    }

    // Transform to camelCase
    const transformed = {
      id: storyboard.id,
      whopUserId: storyboard.whop_user_id,
      title: storyboard.title,
      description: storyboard.description,
      genre: storyboard.genre,
      mood: storyboard.mood,
      styleNotes: storyboard.style_notes,
      conversationId: storyboard.conversation_id,
      defaultAspectRatio: storyboard.default_aspect_ratio,
      defaultModelSlug: storyboard.default_model_slug,
      status: storyboard.status,
      totalShots: storyboard.total_shots,
      completedShots: storyboard.completed_shots,
      createdAt: storyboard.created_at,
      updatedAt: storyboard.updated_at,
    }

    return NextResponse.json({ storyboard: transformed }, { status: 201 })
  } catch (error) {
    console.error('Storyboards API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
