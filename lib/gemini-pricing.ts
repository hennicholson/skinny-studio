/**
 * Gemini API pricing calculator
 * Prices are per 1 million tokens in USD
 * Updated: December 2024
 */

export interface GeminiPricing {
  input: number  // USD per 1M input tokens
  output: number // USD per 1M output tokens
}

// Gemini model pricing (per 1M tokens in USD)
// Source: https://ai.google.dev/pricing
export const GEMINI_PRICING: Record<string, GeminiPricing> = {
  // Flash models (fast, cost-effective)
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },

  // Pro models (higher capability)
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-2.0-pro': { input: 1.25, output: 5.00 },
}

// Default pricing for unknown models (use flash pricing as fallback)
const DEFAULT_PRICING: GeminiPricing = { input: 0.075, output: 0.30 }

/**
 * Calculate the estimated cost in cents for a Gemini API call
 * @param model - The model ID (e.g., 'gemini-2.5-flash')
 * @param inputTokens - Number of tokens in the prompt
 * @param outputTokens - Number of tokens in the response
 * @returns Estimated cost in cents (USD)
 */
export function calculateGeminiCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = GEMINI_PRICING[model] || DEFAULT_PRICING

  // Calculate cost in USD
  const inputCostUsd = (inputTokens / 1_000_000) * pricing.input
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.output

  // Convert to cents
  const totalCents = (inputCostUsd + outputCostUsd) * 100

  return totalCents
}

/**
 * Format cost in cents to a display string
 * @param cents - Cost in cents
 * @returns Formatted string (e.g., "$0.05" or "<$0.01")
 */
export function formatCostCents(cents: number): string {
  if (cents < 0.01) {
    return '<$0.01'
  }
  if (cents < 1) {
    return `$${(cents / 100).toFixed(4)}`
  }
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Get pricing info for a model
 * @param model - The model ID
 * @returns Pricing object or default
 */
export function getModelPricing(model: string): GeminiPricing {
  return GEMINI_PRICING[model] || DEFAULT_PRICING
}
