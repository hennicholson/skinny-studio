import { NextResponse } from 'next/server';
import { hasWhopAuth } from '@/lib/whop';
import { estimateTokenCost } from '@/lib/motion/pricing';
import { BuilderState } from '@/lib/motion/prompt-builder';

export const runtime = 'nodejs';

// POST /api/motion/estimate - Estimate tokens and cost for a generation
export async function POST(request: Request) {
  try {
    const isAuthenticated = await hasWhopAuth();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { builderState } = body;

    if (!builderState) {
      return NextResponse.json({ error: 'Builder state is required' }, { status: 400 });
    }

    // Validate minimum required fields
    if (!builderState.videoType || !builderState.title) {
      return NextResponse.json(
        { error: 'Video type and title are required' },
        { status: 400 }
      );
    }

    // Create full BuilderState with defaults
    const state: BuilderState = {
      videoType: builderState.videoType || 'announcement',
      effects: builderState.effects || [],
      colorTheme: builderState.colorTheme || 'lime',
      customColors: builderState.customColors,
      speed: builderState.speed || 'normal',
      easing: builderState.easing || 'smooth',
      intensity: builderState.intensity ?? 0.5,
      title: builderState.title || '',
      subtitle: builderState.subtitle,
      details: builderState.details,
      duration: builderState.duration || 10,
      naturalLanguage: builderState.naturalLanguage,
      brandProfile: builderState.brandProfile,
    };

    const estimate = estimateTokenCost(state);

    return NextResponse.json({
      estimate,
      breakdown: {
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
        inputCost: `$${(estimate.inputCostCents / 100).toFixed(4)}`,
        outputCost: `$${(estimate.outputCostCents / 100).toFixed(4)}`,
        renderCost: `$${(estimate.renderCostCents / 100).toFixed(4)}`,
        platformFee: `$${(estimate.markupCents / 100).toFixed(4)}`,
        total: `$${(estimate.totalCents / 100).toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error('Motion estimate error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
