// Skinny Motion - Token-Based Pricing
// Calculates costs for Claude API calls and rendering with 10% markup

import { BuilderState, buildPromptFromSelections } from './prompt-builder';

// Claude 4.5 Sonnet pricing via Replicate
const CLAUDE_PRICING = {
  // Input tokens (prompt + system prompt)
  inputPerMillionTokens: 3.00, // $3.00 per 1M input tokens

  // Output tokens (generated code)
  outputPerThousandTokens: 0.015, // $0.015 per 1K output tokens (= $15 per 1M)
};

// Remotion rendering costs (compute)
const RENDER_PRICING = {
  perSecondCents: 2, // $0.02 per second of video rendered
};

// Platform markup
const PLATFORM_MARKUP = 0.10; // 10% markup on all costs

// Estimated system prompt tokens (based on system-prompt.ts)
const SYSTEM_PROMPT_TOKENS = 3000;

// Average output tokens for generated code
const AVG_OUTPUT_TOKENS = 4000;

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  inputCostCents: number;
  outputCostCents: number;
  renderCostCents: number;
  subtotalCents: number;
  markupCents: number;
  totalCents: number;
}

/**
 * Estimate tokens and cost from builder state (frontend estimation)
 * This is an estimate - actual costs are calculated after generation
 */
export function estimateTokenCost(builderState: BuilderState): TokenEstimate {
  // Build the prompt to estimate input tokens
  const prompt = buildPromptFromSelections(builderState);

  // Rough token estimation: ~4 characters per token
  const promptTokens = Math.ceil(prompt.length / 4);
  const inputTokens = promptTokens + SYSTEM_PROMPT_TOKENS;

  // Output tokens based on complexity
  const complexityMultiplier = getComplexityMultiplier(builderState);
  const outputTokens = Math.ceil(AVG_OUTPUT_TOKENS * complexityMultiplier);

  // Calculate costs in cents
  const inputCostCents = (inputTokens / 1_000_000) * CLAUDE_PRICING.inputPerMillionTokens * 100;
  const outputCostCents = (outputTokens / 1000) * CLAUDE_PRICING.outputPerThousandTokens * 100;
  const renderCostCents = builderState.duration * RENDER_PRICING.perSecondCents;

  const subtotalCents = inputCostCents + outputCostCents + renderCostCents;
  const markupCents = subtotalCents * PLATFORM_MARKUP;
  const totalCents = Math.ceil(subtotalCents + markupCents);

  return {
    inputTokens,
    outputTokens,
    inputCostCents: Math.round(inputCostCents * 100) / 100,
    outputCostCents: Math.round(outputCostCents * 100) / 100,
    renderCostCents,
    subtotalCents: Math.round(subtotalCents * 100) / 100,
    markupCents: Math.round(markupCents * 100) / 100,
    totalCents,
  };
}

/**
 * Calculate actual cost after generation (backend billing)
 * Uses actual token counts from the API response
 */
export function calculateActualCost(
  inputTokens: number,
  outputTokens: number,
  durationSeconds: number
): {
  inputCostCents: number;
  outputCostCents: number;
  renderCostCents: number;
  subtotalCents: number;
  markupCents: number;
  totalCents: number;
} {
  const inputCostCents = (inputTokens / 1_000_000) * CLAUDE_PRICING.inputPerMillionTokens * 100;
  const outputCostCents = (outputTokens / 1000) * CLAUDE_PRICING.outputPerThousandTokens * 100;
  const renderCostCents = durationSeconds * RENDER_PRICING.perSecondCents;

  const subtotalCents = inputCostCents + outputCostCents + renderCostCents;
  const markupCents = subtotalCents * PLATFORM_MARKUP;
  const totalCents = Math.ceil(subtotalCents + markupCents);

  return {
    inputCostCents: Math.round(inputCostCents * 100) / 100,
    outputCostCents: Math.round(outputCostCents * 100) / 100,
    renderCostCents,
    subtotalCents: Math.round(subtotalCents * 100) / 100,
    markupCents: Math.round(markupCents * 100) / 100,
    totalCents,
  };
}

/**
 * Get complexity multiplier based on builder state
 * More effects/features = more code output
 */
function getComplexityMultiplier(state: BuilderState): number {
  let multiplier = 1.0;

  // More effects = more code
  if (state.effects.length > 5) multiplier += 0.2;
  if (state.effects.length > 10) multiplier += 0.3;

  // Longer videos need more scenes
  if (state.duration > 10) multiplier += 0.2;
  if (state.duration > 20) multiplier += 0.3;

  // Natural language additions add complexity
  if (state.naturalLanguage && state.naturalLanguage.length > 100) multiplier += 0.1;

  // Brand profile adds logo/watermark handling
  if (state.brandProfile) multiplier += 0.1;

  return Math.min(multiplier, 2.0); // Cap at 2x
}

/**
 * Format cost for display
 */
export function formatCost(cents: number): string {
  if (cents < 100) {
    return `$0.${cents.toString().padStart(2, '0')}`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }
  return `${(tokens / 1000).toFixed(1)}k`;
}

/**
 * Check if user has sufficient balance
 */
export function hasInsufficientBalance(balanceCents: number, estimatedCostCents: number): boolean {
  return balanceCents < estimatedCostCents;
}

/**
 * Get cost breakdown as a formatted string (for display)
 */
export function getCostBreakdown(estimate: TokenEstimate): string[] {
  return [
    `Input: ${formatTokens(estimate.inputTokens)} tokens (${formatCost(estimate.inputCostCents)})`,
    `Output: ~${formatTokens(estimate.outputTokens)} tokens (${formatCost(estimate.outputCostCents)})`,
    `Render: ${formatCost(estimate.renderCostCents)}`,
    `Platform fee: ${formatCost(estimate.markupCents)}`,
    `Total: ${formatCost(estimate.totalCents)}`,
  ];
}

export default {
  estimateTokenCost,
  calculateActualCost,
  formatCost,
  formatTokens,
  hasInsufficientBalance,
  getCostBreakdown,
};
