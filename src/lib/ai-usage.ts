import 'server-only';
import { db } from '@/lib/db';

/**
 * Very small, provider-agnostic cost estimate used only for the
 * recruiter-facing "roughly how much did this interview cost" number — not
 * a billing-accurate figure. Rates are per 1K tokens, USD, deliberately
 * conservative/approximate and easy to update without touching call sites.
 */
const RATE_PER_1K_USD: Record<string, { input: number; output: number }> = {
  openai: { input: 0.00015, output: 0.0006 },
  anthropic: { input: 0.003, output: 0.015 },
  gemini: { input: 0.0001, output: 0.0004 },
};

function estimateCostUsd(provider: string, inputTokens: number, outputTokens: number): number | null {
  const rate = RATE_PER_1K_USD[provider];
  if (!rate) return null;
  return (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
}

export type AiUsagePurpose =
  | 'QUESTION_GEN'
  | 'ADAPTIVE_TURN'
  | 'ADAPTIVE_EVALUATION'
  | 'ANSWER_EVALUATION'
  | 'RESUME_EVALUATION';

export interface LogAiUsageParams {
  provider: string;
  model: string;
  purpose: AiUsagePurpose;
  interviewId?: string;
  applicationId?: string;
  inputTokens: number;
  outputTokens: number;
  succeeded: boolean;
}

/**
 * Fire-and-forget usage logging — never throws into the caller's request
 * path. Losing a usage-tracking row is not worth failing (or retrying) an
 * interview turn over; we log and move on.
 */
export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  try {
    await db.aiUsageLog.create({
      data: {
        provider: params.provider,
        model: params.model,
        purpose: params.purpose,
        interviewId: params.interviewId,
        applicationId: params.applicationId,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCostUsd: estimateCostUsd(params.provider, params.inputTokens, params.outputTokens),
        succeeded: params.succeeded,
      },
    });
  } catch (err) {
    console.error('[ai-usage] failed to write usage log', err);
  }
}

/** Rough token estimate (chars/4) for providers/responses that don't report usage back to us. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
