import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabaseAdmin';
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop';
import { generateVideoCode } from '@/lib/motion/generate';
import { buildPromptFromSelections, BuilderState } from '@/lib/motion/prompt-builder';
import { calculateActualCost } from '@/lib/motion/pricing';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for generation

// POST /api/motion/generate - Generate Remotion code for a project
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
    const { projectId, builderState } = body;

    if (!projectId && !builderState) {
      return NextResponse.json(
        { error: 'Either projectId or builderState is required' },
        { status: 400 }
      );
    }

    // Get user's balance
    const { data: userProfile, error: profileError } = await sbAdmin
      .from('user_profiles')
      .select('balance_cents')
      .eq('whop_user_id', whopUserId)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Get Replicate token from environment
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      return NextResponse.json(
        { error: 'Replicate API not configured' },
        { status: 500 }
      );
    }

    let state: BuilderState;
    let project = null;

    if (projectId) {
      // Load project from database
      const { data: projectData, error: projectError } = await sbAdmin
        .from('motion_projects')
        .select('*, brand_profile:brand_profiles(*)')
        .eq('id', projectId)
        .eq('whop_user_id', whopUserId)
        .single();

      if (projectError || !projectData) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      project = projectData;

      // Build state from project
      state = {
        videoType: project.video_type as BuilderState['videoType'],
        effects: project.effects || [],
        colorTheme: project.color_theme || 'lime',
        customColors: project.custom_colors,
        speed: project.speed as BuilderState['speed'],
        easing: project.easing,
        intensity: project.intensity,
        title: project.headline || project.title,
        subtitle: project.subtitle,
        details: project.details,
        duration: project.duration,
        naturalLanguage: project.natural_language,
        brandProfile: project.brand_profile ? {
          primaryColor: project.brand_profile.primary_color,
          secondaryColor: project.brand_profile.secondary_color,
          backgroundColor: project.brand_profile.background_color,
          headingFont: project.brand_profile.heading_font,
          bodyFont: project.brand_profile.body_font,
          logoUrl: project.brand_profile.logo_url,
          watermarkUrl: project.brand_profile.watermark_url,
        } : undefined,
      };

      // Update project status to generating
      await sbAdmin
        .from('motion_projects')
        .update({ status: 'generating', updated_at: new Date().toISOString() })
        .eq('id', projectId);
    } else {
      state = builderState;
    }

    // Build the prompt
    const prompt = buildPromptFromSelections(state);

    console.log('[Motion Generate] Starting generation for:', state.title);

    // Generate the code
    const result = await generateVideoCode(prompt, {
      duration: state.duration,
      style: `Modern, professional with ${state.colorTheme} theme`,
      replicateToken,
    });

    console.log('[Motion Generate] Generation complete:', {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      attempt: result.metadata.attempt,
    });

    // Calculate actual cost with 10% markup
    const costDetails = calculateActualCost(
      result.inputTokens,
      result.outputTokens,
      state.duration
    );

    // Check if user has sufficient balance
    if (userProfile.balance_cents < costDetails.totalCents) {
      if (project) {
        await sbAdmin
          .from('motion_projects')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', projectId);
      }

      return NextResponse.json(
        {
          error: 'Insufficient balance',
          required: costDetails.totalCents,
          available: userProfile.balance_cents,
        },
        { status: 402 }
      );
    }

    // Deduct from user's balance
    const { error: balanceError } = await sbAdmin
      .from('user_profiles')
      .update({
        balance_cents: userProfile.balance_cents - costDetails.totalCents,
      })
      .eq('whop_user_id', whopUserId);

    if (balanceError) {
      console.error('Failed to deduct balance:', balanceError);
      // Continue anyway - we'll reconcile later
    }

    // Log the credit transaction
    await sbAdmin.from('credit_transactions').insert({
      whop_user_id: whopUserId,
      amount: -(costDetails.totalCents / 100), // Negative = deduction, in dollars
      type: 'motion_generation',
      task: 'Motion Graphics Generation',
      metadata: {
        projectId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        duration: state.duration,
        costBreakdown: costDetails,
      },
    });

    // Update project with generated code and costs
    if (project) {
      await sbAdmin
        .from('motion_projects')
        .update({
          status: 'complete',
          generated_code: result.code,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_cents: costDetails.totalCents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    }

    return NextResponse.json({
      success: true,
      code: result.code,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
      },
      cost: costDetails,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('Motion generate error:', error);

    // Update project status to error if we have a projectId
    const body = await request.clone().json().catch(() => ({}));
    if (body.projectId) {
      await sbAdmin
        .from('motion_projects')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', body.projectId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
