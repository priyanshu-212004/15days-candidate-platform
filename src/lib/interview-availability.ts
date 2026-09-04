export type PublicInterviewUnavailableReason =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'NO_QUESTIONS'
  | 'NO_BLUEPRINT';

export interface AvailabilityCheckInput {
  status: string;
  expiresAt: Date | null;
  questionCount: number;
  // Phase 6: STATIC interviews (the default, and every interview that
  // existed before this field) are checked exactly as before — a fixed
  // question list must exist. ADAPTIVE_VOICE interviews have no
  // InterviewQuestion rows by design; they're checked against
  // hasBlueprint instead. Optional + defaulted so existing callers that
  // don't pass these two fields keep the original STATIC behavior.
  interviewType?: 'STATIC' | 'ADAPTIVE_VOICE';
  hasBlueprint?: boolean;
}

export type AvailabilityResult =
  | { available: true }
  | { available: false; reason: PublicInterviewUnavailableReason };

/**
 * Single source of truth for whether a published interview link should be
 * usable right now. Shared by the public API route and the public page so
 * the two can never silently drift out of sync.
 */
export function evaluateInterviewAvailability(
  interview: AvailabilityCheckInput | null,
  now: Date = new Date()
): AvailabilityResult {
  if (!interview) return { available: false, reason: 'NOT_FOUND' };
  if (interview.expiresAt && interview.expiresAt < now) return { available: false, reason: 'EXPIRED' };
  if (interview.status !== 'ACTIVE') return { available: false, reason: 'INACTIVE' };

  if (interview.interviewType === 'ADAPTIVE_VOICE') {
    if (!interview.hasBlueprint) return { available: false, reason: 'NO_BLUEPRINT' };
    return { available: true };
  }

  if (interview.questionCount === 0) return { available: false, reason: 'NO_QUESTIONS' };
  return { available: true };
}
