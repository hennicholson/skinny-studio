import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabaseAdmin';
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop';

export const runtime = 'nodejs';

// GET /api/motion/brands - List user's brand profiles
export async function GET() {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const { data: profiles, error } = await sbAdmin
      .from('brand_profiles')
      .select('*')
      .eq('whop_user_id', whopUserId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching brand profiles:', error);
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }

    return NextResponse.json({ profiles: profiles || [] });
  } catch (error) {
    console.error('Brand profiles API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/motion/brands - Create a new brand profile
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
      name,
      primary_color,
      secondary_color,
      background_color,
      accent_colors,
      heading_font,
      body_font,
      custom_fonts,
      logo_url,
      logo_dark_url,
      icon_url,
      watermark_url,
      is_default,
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // If setting as default, unset any existing default
    if (is_default) {
      await sbAdmin
        .from('brand_profiles')
        .update({ is_default: false })
        .eq('whop_user_id', whopUserId);
    }

    const { data: profile, error } = await sbAdmin
      .from('brand_profiles')
      .insert({
        whop_user_id: whopUserId,
        name: name.trim(),
        primary_color: primary_color || '#D6FC51',
        secondary_color: secondary_color || '#B8E040',
        background_color: background_color || '#0D0D0D',
        accent_colors: accent_colors || [],
        heading_font: heading_font || 'Inter',
        body_font: body_font || 'Inter',
        custom_fonts: custom_fonts || [],
        logo_url: logo_url || null,
        logo_dark_url: logo_dark_url || null,
        icon_url: icon_url || null,
        watermark_url: watermark_url || null,
        is_default: is_default || false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating brand profile:', error);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Create brand profile error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH /api/motion/brands - Update a brand profile
export async function PATCH(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Only allow certain fields to be updated
    const allowedUpdates: Record<string, any> = {};
    if (updates.name !== undefined) allowedUpdates.name = updates.name;
    if (updates.primary_color !== undefined) allowedUpdates.primary_color = updates.primary_color;
    if (updates.secondary_color !== undefined) allowedUpdates.secondary_color = updates.secondary_color;
    if (updates.background_color !== undefined) allowedUpdates.background_color = updates.background_color;
    if (updates.accent_colors !== undefined) allowedUpdates.accent_colors = updates.accent_colors;
    if (updates.heading_font !== undefined) allowedUpdates.heading_font = updates.heading_font;
    if (updates.body_font !== undefined) allowedUpdates.body_font = updates.body_font;
    if (updates.custom_fonts !== undefined) allowedUpdates.custom_fonts = updates.custom_fonts;
    if (updates.logo_url !== undefined) allowedUpdates.logo_url = updates.logo_url;
    if (updates.logo_dark_url !== undefined) allowedUpdates.logo_dark_url = updates.logo_dark_url;
    if (updates.icon_url !== undefined) allowedUpdates.icon_url = updates.icon_url;
    if (updates.watermark_url !== undefined) allowedUpdates.watermark_url = updates.watermark_url;

    // Handle is_default separately
    if (updates.is_default === true) {
      // Unset any existing default first
      await sbAdmin
        .from('brand_profiles')
        .update({ is_default: false })
        .eq('whop_user_id', whopUserId);
      allowedUpdates.is_default = true;
    } else if (updates.is_default === false) {
      allowedUpdates.is_default = false;
    }

    allowedUpdates.updated_at = new Date().toISOString();

    const { data: profile, error } = await sbAdmin
      .from('brand_profiles')
      .update(allowedUpdates)
      .eq('id', id)
      .eq('whop_user_id', whopUserId)
      .select()
      .single();

    if (error) {
      console.error('Error updating brand profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Update brand profile error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/motion/brands - Delete a brand profile
export async function DELETE(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, hintedId } = await getWhopAuthFromHeaders();
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId);
    const whopUserId = whop.id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const { error } = await sbAdmin
      .from('brand_profiles')
      .delete()
      .eq('id', id)
      .eq('whop_user_id', whopUserId);

    if (error) {
      console.error('Error deleting brand profile:', error);
      return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete brand profile error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
