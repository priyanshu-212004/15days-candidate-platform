/**
 * Deterministic, application-level rules for adaptive voice interviews.
 * Kept separate from interview-engine.ts (which talks to the AI provider
 * and the database) so these can be unit tested directly — mirroring the
 * existing interview-availability.ts / candidate-session.ts pattern in
 * this codebase.
 *
 * Nothing here calls an AI provider. The AI may *recommend* a follow-up or
 * a longer interview; only these functions decide what the backend
 * actually allows, per the "never let the LLM control critical application
 * state directly" requirement.
 */

export interface DurationConfig {
  durationTargetMin: number;
  durationMinMin: number;
  durationMaxMin: number;
  graceSeconds: number;
}

export interface TimeCheckResult {
  elapsedSec: number;
  mustEnd: boolean;
  pastTarget: boolean;
  reason?: 'MAX_DURATION_REACHED';
}

/**
 * The only source of truth for "is the interview over on time." Never
 * relies on question count. `inGraceAnswer` lets a caller pass "the
 * candidate is mid-answer near the max" to extend by graceSeconds once —
 * the grace period is a single bounded extension, not a repeatable one.
 */
export function checkElapsedTime(
  startedAt: Date,
  now: Date,
  config: DurationConfig,
  inGraceAnswer = false
): TimeCheckResult {
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  const maxSec = config.durationMaxMin * 60 + (inGraceAnswer ? config.graceSeconds : 0);
  const targetSec = config.durationTargetMin * 60;

  return {
    elapsedSec,
    mustEnd: elapsedSec >= maxSec,
    pastTarget: elapsedSec >= targetSec,
    reason: elapsedSec >= maxSec ? 'MAX_DURATION_REACHED' : undefined,
  };
}

/** Task spec §10 — the AI can suggest FOLLOW_UP; this is what actually allows or blocks it. */
export function isFollowUpAllowed(
  followUpCountByTopic: Record<string, number>,
  topic: string,
  maxFollowUpsPerTopic: number
): boolean {
  return (followUpCountByTopic[topic] ?? 0) < maxFollowUpsPerTopic;
}

export function incrementFollowUpCount(
  followUpCountByTopic: Record<string, number>,
  topic: string
): Record<string, number> {
  return { ...followUpCountByTopic, [topic]: (followUpCountByTopic[topic] ?? 0) + 1 };
}

export interface TopicState {
  currentTopic: string | null;
  topicsCovered: string[];
  topicsRemaining: string[];
}

/** Moves to a new topic, marking the previous one covered. Pure bookkeeping — never decides *which* topic, only records the transition. */
export function advanceToTopic(state: TopicState, nextTopic: string): TopicState {
  const topicsCovered = state.currentTopic && !state.topicsCovered.includes(state.currentTopic)
    ? [...state.topicsCovered, state.currentTopic]
    : state.topicsCovered;
  return {
    currentTopic: nextTopic,
    topicsCovered,
    topicsRemaining: state.topicsRemaining.filter((t) => t !== nextTopic),
  };
}

export type EndReason =
  | 'MAX_DURATION_REACHED'
  | 'AI_RECOMMENDED_END'
  | 'ALL_TOPICS_COVERED'
  | 'MAX_QUESTIONS_REACHED';

/**
 * Whether the interview should end right now, checked *before* trusting the
 * AI's own END_INTERVIEW recommendation. The backend enforces the hard
 * ceiling regardless of what the AI wants to do next (task spec §9).
 */
export function shouldEndInterview(params: {
  timeCheck: TimeCheckResult;
  aiRecommendedEnd: boolean;
  topicsRemaining: string[];
  questionCount: number;
  maxQuestions: number;
}): { end: boolean; reason?: EndReason } {
  if (params.timeCheck.mustEnd) return { end: true, reason: 'MAX_DURATION_REACHED' };
  if (params.questionCount >= params.maxQuestions) return { end: true, reason: 'MAX_QUESTIONS_REACHED' };
  if (params.aiRecommendedEnd && params.timeCheck.pastTarget) return { end: true, reason: 'AI_RECOMMENDED_END' };
  if (params.topicsRemaining.length === 0 && params.timeCheck.pastTarget) {
    return { end: true, reason: 'ALL_TOPICS_COVERED' };
  }
  return { end: false };
}

/**
 * Hard ceiling on total turns regardless of duration, so a slow-talking
 * candidate or a misbehaving AI can't produce an unbounded question count.
 * Generous relative to a ~20-minute interview (task spec §9) — this exists
 * purely as a backstop, not the primary end condition.
 */
export const MAX_QUESTIONS_HARD_CAP = 40;
