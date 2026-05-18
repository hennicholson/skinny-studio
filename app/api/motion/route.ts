import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabaseAdmin';
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop';

export const runtime = 'nodejs';

// GET /api/motion - List user's motion projects
export async function GET(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = sbAdmin
      .from('motion_projects')
      .select(`
        *,
        brand_profile:brand_profiles(id, name, primary_color, secondary_color, logo_url)
      `)
      .eq('whop_user_id', whopUserId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: projects, error } = await query;

    if (error) {
      console.error('Error fetching motion projects:', error);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    return NextResponse.json({ projects: projects || [] });
  } catch (error) {
    console.error('Motion projects API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/motion - Create a new motion project
export async function POST(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const body = await request.json();
    const {
      title,
      description,
      video_type,
      effects,
      color_theme,
      custom_colors,
      speed,
      easing,
      intensity,
      duration,
      headline,
      subtitle,
      details,
      natural_language,
      brand_profile_id,
    } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!video_type) {
      return NextResponse.json({ error: 'Video type is required' }, { status: 400 });
    }

    const { data: project, error } = await sbAdmin
      .from('motion_projects')
      .insert({
        whop_user_id: whopUserId,
        title: title.trim(),
        description: description || null,
        status: 'draft',
        video_type,
        effects: effects || [],
        color_theme: color_theme || null,
        custom_colors: custom_colors || null,
        speed: speed || 'normal',
        easing: easing || 'smooth',
        intensity: intensity ?? 0.5,
        duration: duration || 10,
        headline: headline || title.trim(),
        subtitle: subtitle || null,
        details: details || null,
        natural_language: natural_language || null,
        brand_profile_id: brand_profile_id || null,
        timeline: [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating motion project:', error);
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Create motion project error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
