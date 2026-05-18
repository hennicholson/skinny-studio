import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabaseAdmin';
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop';

export const runtime = 'nodejs';

// GET /api/motion/[id] - Get a single motion project with scenes
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const { id } = await params;

    // Get project with brand profile
    const { data: project, error } = await sbAdmin
      .from('motion_projects')
      .select(`
        *,
        brand_profile:brand_profiles(*)
      `)
      .eq('id', id)
      .eq('whop_user_id', whopUserId)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get scenes for this project
    const { data: scenes } = await sbAdmin
      .from('motion_scenes')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true });

    return NextResponse.json({
      project: {
        ...project,
        scenes: scenes || [],
      },
    });
  } catch (error) {
    console.error('Get motion project error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH /api/motion/[id] - Update a motion project
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const { id } = await params;
    const body = await request.json();

    // Build allowed updates
    const allowedUpdates: Record<string, any> = {};

    const allowedFields = [
      'title', 'description', 'status', 'video_type', 'effects',
      'color_theme', 'custom_colors', 'speed', 'easing', 'intensity',
      'duration', 'headline', 'subtitle', 'details', 'natural_language',
      'brand_profile_id', 'timeline', 'generated_code', 'output_url',
      'thumbnail_url', 'input_tokens', 'output_tokens', 'cost_cents',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        allowedUpdates[field] = body[field];
      }
    }

    allowedUpdates.updated_at = new Date().toISOString();

    const { data: project, error } = await sbAdmin
      .from('motion_projects')
      .update(allowedUpdates)
      .eq('id', id)
      .eq('whop_user_id', whopUserId)
      .select()
      .single();

    if (error) {
      console.error('Error updating motion project:', error);
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Update motion project error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/motion/[id] - Delete a motion project
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const { id } = await params;

    // Scenes will be deleted automatically due to ON DELETE CASCADE
    const { error } = await sbAdmin
      .from('motion_projects')
      .delete()
      .eq('id', id)
      .eq('whop_user_id', whopUserId);

    if (error) {
      console.error('Error deleting motion project:', error);
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete motion project error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
