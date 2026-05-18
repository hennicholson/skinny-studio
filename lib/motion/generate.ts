// Skinny Motion - Code Generation via Claude 4.5 Sonnet
// Uses Replicate API to access Claude

import { SYSTEM_PROMPT, buildUserPrompt } from './system-prompt';
import { validateGeneratedCode } from './validation';

const MAX_RETRIES = 3;
const REPLICATE_MODEL = 'anthropic/claude-4.5-sonnet';
const REPLICATE_API_URL = 'https://api.replicate.com/v1/models/anthropic/claude-4.5-sonnet/predictions';

interface GenerateOptions {
  duration?: number;
  style?: string;
  replicateToken: string;
}

export interface GenerateResult {
  code: string;
  inputTokens: number;
  outputTokens: number;
  metadata: {
    model: string;
    attempt: number;
    warnings: string[];
  };
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[];
  error?: string;
  metrics?: {
    input_token_count?: number;
    output_token_count?: number;
  };
  urls: {
    get: string;
    cancel: string;
  };
}

async function createPrediction(
  prompt: string,
  systemPrompt: string,
  replicateToken: string
): Promise<ReplicatePrediction> {
  const response = await fetch(REPLICATE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${replicateToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: prompt,
        system_prompt: systemPrompt,
        max_tokens: 8000,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.detail || errorData.error || `HTTP ${response.status}`;

    if (response.status === 401) {
      throw new Error('Invalid Replicate API token');
    } else if (response.status === 402) {
      throw new Error('Insufficient Replicate credits');
    } else if (response.status === 429) {
      throw new Error('Rate limited - please try again later');
    }

    throw new Error(`Replicate API error: ${errorMessage}`);
  }

  return response.json();
}

async function pollPrediction(
  predictionUrl: string,
  replicateToken: string
): Promise<ReplicatePrediction> {
  const response = await fetch(predictionUrl, {
    headers: {
      'Authorization': `Bearer ${replicateToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to poll prediction: HTTP ${response.status}`);
  }

  return response.json();
}

async function waitForPrediction(
  prediction: ReplicatePrediction,
  replicateToken: string
): Promise<ReplicatePrediction> {
  let result = prediction;
  let pollCount = 0;
  const maxPolls = 120; // 2 minutes max wait time

  while (result.status !== 'succeeded' && result.status !== 'failed' && result.status !== 'canceled') {
    if (pollCount >= maxPolls) {
      throw new Error('Prediction timed out after 2 minutes');
    }

    await sleep(1000);
    result = await pollPrediction(result.urls.get, replicateToken);
    pollCount++;

    if (pollCount % 10 === 0) {
      console.log(`[Generate] Still waiting... (${pollCount}s)`);
    }
  }

  if (result.status === 'failed') {
    throw new Error(`Prediction failed: ${result.error || 'Unknown error'}`);
  }

  if (result.status === 'canceled') {
    throw new Error('Prediction was canceled');
  }

  return result;
}

export async function generateVideoCode(
  prompt: string,
  options: GenerateOptions
): Promise<GenerateResult> {
  const { replicateToken } = options;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`[Generate] Attempt ${attempt + 1}/${MAX_RETRIES}`);

      const userPrompt = buildUserPrompt(prompt, options, lastError);

      // Create prediction
      console.log('[Generate] Creating Replicate prediction...');
      const prediction = await createPrediction(userPrompt, SYSTEM_PROMPT, replicateToken);
      console.log(`[Generate] Prediction created: ${prediction.id}`);

      // Wait for completion
      console.log('[Generate] Waiting for prediction to complete...');
      const result = await waitForPrediction(prediction, replicateToken);
      console.log('[Generate] Prediction completed');

      // Extract output
      if (!result.output || result.output.length === 0) {
        throw new Error('No output received from model');
      }

      const fullOutput = result.output.join('');
      const code = extractCodeFromResponse(fullOutput);

      // Validate the generated code
      const validation = await validateGeneratedCode(code);

      if (!validation.valid) {
        lastError = validation.errors.join('\n');
        console.log(`[Generate] Validation failed: ${lastError}`);
        continue;
      }

      console.log(`[Generate] Success on attempt ${attempt + 1}`);

      // Extract token counts from metrics
      const inputTokens = result.metrics?.input_token_count || estimateTokens(userPrompt + SYSTEM_PROMPT);
      const outputTokens = result.metrics?.output_token_count || estimateTokens(code);

      return {
        code,
        inputTokens,
        outputTokens,
        metadata: {
          model: REPLICATE_MODEL,
          attempt: attempt + 1,
          warnings: validation.warnings,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[Generate] Error on attempt ${attempt + 1}:`, lastError);

      // Don't retry on auth or credit errors
      if (lastError.includes('Invalid Replicate API token') ||
          lastError.includes('Insufficient Replicate credits')) {
        throw error;
      }

      // Exponential backoff
      if (attempt < MAX_RETRIES - 1) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  throw new Error(`Failed to generate video code after ${MAX_RETRIES} attempts: ${lastError}`);
}

function extractCodeFromResponse(text: string): string {
  // Try to extract code from markdown code blocks
  const codeBlockMatch = text.match(/```(?:tsx?|typescript|javascript)?\s*([\s\S]*?)```/);

  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // If no code block, check if the entire response looks like code
  if (text.includes('import') && text.includes('export default')) {
    return text.trim();
  }

  // Try to find the code between common markers
  const importMatch = text.indexOf('import');
  const exportMatch = text.lastIndexOf('export default');

  if (importMatch !== -1 && exportMatch !== -1) {
    let endIndex = text.length;
    const afterExport = text.slice(exportMatch);
    const semicolonIndex = afterExport.indexOf(';');
    if (semicolonIndex !== -1) {
      endIndex = exportMatch + semicolonIndex + 1;
    }

    return text.slice(importMatch, endIndex).trim();
  }

  throw new Error('Could not extract code from response');
}

function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default generateVideoCode;
