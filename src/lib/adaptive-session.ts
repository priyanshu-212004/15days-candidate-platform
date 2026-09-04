import 'server-only';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  checkElapsedTime,
  isFollowUpAllowed,
  incrementFollowUpCount,
  advanceToTopic,
  shouldEndInterview,
  MAX_QUESTIONS_HARD_CAP,
  type DurationConfig,
} from '@/lib/interview-engine-rules';
import { getNextTurn, generateAdaptiveEvaluation, type CompactState, type EvidenceEntry } from '@/lib/interview-engine';
import { AiConfigError, AiGenerationError } from '@/lib/ai-provider';
import type { EvaluationArea, AdaptiveDecision } from '@/lib/validations/interview';

export { AiConfigError, AiGenerationError };

export interface BlueprintLike {
  durationTargetMin: number;
  durationMinMin: number;
  durationMaxMin: number;
  graceSeconds: number;
  maxFollowUpsPerTopic: number;
  evaluationAreas: Prisma.JsonValue;
}

function areasOf(blueprint: BlueprintLike): EvaluationArea[] {
  return (blueprint.evaluationAreas as unknown as EvaluationArea[]) ?? [];
}

function durationConfig(blueprint: BlueprintLike): DurationConfig {
  return {
    durationTargetMin: blueprint.durationTargetMin,
    durationMinMin: blueprint.durationMinMin,
    durationMaxMin: blueprint.durationMaxMin,
    graceSeconds: blueprint.graceSeconds,
  };
}

/**
 * Idempotent: returns the existing session (resume-after-refresh) or
 * creates one with all topics loaded from the blueprint as "remaining".
 * Never generates a question here — that's a separate AI call the caller
 * makes only when there's no unanswered turn to resume.
 */
export async function getOrCreateSession(applicationId: string, blueprint: BlueprintLike) {
  const existing = await db.interviewSession.findUnique({
    where: { applicationId },
    include: { turns: { orderBy: { turnNumber: 'asc' } } },
  });
  if (existing) return existing;

  const areas = areasOf(blueprint);
  const created = await db.interviewSession.create({
    data: {
      applicationId,
      topicsRemaining: areas.map((a) => a.name),
    },
    include: { turns: { orderBy: { turnNumber: 'asc' } } },
  });
  return created;
}

export type SessionWithTurns = Awaited<ReturnType<typeof getOrCreateSession>>;

/** The compact, token-bounded state sent to the AI each turn — never the full transcript (task spec §15). */
export function buildCompactState(
  session: SessionWithTurns,
  blueprint: BlueprintLike,
  jobTitle: string,
  now: Date
): CompactState {
  const lastTurn = session.turns[session.turns.length - 1] ?? null;
  const config = durationConfig(blueprint);
  const timeCheck = checkElapsedTime(session.startedAt, now, config);

  return {
    jobTitle,
    evaluationAreas: areasOf(blueprint),
    currentTopic: session.currentTopic,
    topicsCovered: session.topicsCovered,
    topicsRemaining: session.topicsRemaining,
    candidateEvidence: (session.candidateEvidence as unknown as Record<string, EvidenceEntry>) ?? {},
    lastQuestion: lastTurn?.question ?? null,
    lastAnswer: lastTurn?.answerText ?? null,
    questionCount: session.questionCount,
    elapsedSec: timeCheck.elapsedSec,
    targetSec: config.durationTargetMin * 60,
  };
}

export interface TurnOutcome {
  session: SessionWithTurns;
  turn: { id: string; turnNumber: number; topic: string | null; question: string; action: string; difficulty: string | null } | null;
  ended: boolean;
  endReason?: string;
}

/**
 * Applies the AI's decision through the deterministic rules before acting
 * on anything — a FOLLOW_UP the AI recommends is only honored if the
 * per-topic limit allows it; an END_INTERVIEW the AI recommends is only
 * honored once the target duration has actually passed. The backend, not
 * the model, has final say (task spec §8/§10/§13).
 */
async function applyDecision(
  session: SessionWithTurns,
  blueprint: BlueprintLike,
  decision: AdaptiveDecision,
  now: Date
): Promise<TurnOutcome> {
  const config = durationConfig(blueprint);
  const timeCheck = checkElapsedTime(session.startedAt, now, config);

  let nextTopic = session.currentTopic;
  let topicsCovered = session.topicsCovered;
  let topicsRemaining = session.topicsRemaining;
  let followUpCountByTopic = (session.followUpCountByTopic as unknown as Record<string, number>) ?? {};
  let effectiveAction = decision.action;

  if (decision.action === 'FOLLOW_UP') {
    const topic = decision.topic ?? session.currentTopic ?? 'General';
    if (!isFollowUpAllowed(followUpCountByTopic, topic, blueprint.maxFollowUpsPerTopic)) {
      // AI wanted another follow-up but the app-level cap says no — force a
      // topic move instead of trusting the model's own limit-keeping.
      effectiveAction = 'NEW_TOPIC';
    } else {
      followUpCountByTopic = incrementFollowUpCount(followUpCountByTopic, topic);
      nextTopic = topic;
    }
  }

  if (effectiveAction === 'NEW_TOPIC') {
    const topic = decision.topic ?? topicsRemaining[0] ?? session.currentTopic ?? 'General';
    const advanced = advanceToTopic({ currentTopic: session.currentTopic, topicsCovered, topicsRemaining }, topic);
    nextTopic = advanced.currentTopic;
    topicsCovered = advanced.topicsCovered;
    topicsRemaining = advanced.topicsRemaining;
  }

  if (effectiveAction === 'CLARIFICATION') {
    nextTopic = decision.topic ?? session.currentTopic;
  }

  // Merge evidence update, if the AI provided one (omitted only on the very first question).
  let candidateEvidence = (session.candidateEvidence as unknown as Record<string, EvidenceEntry>) ?? {};
  if (decision.evidenceUpdate) {
    const { topic, score, confidence, newEvidence } = decision.evidenceUpdate;
    const existing = candidateEvidence[topic];
    candidateEvidence = {
      ...candidateEvidence,
      [topic]: {
        score,
        confidence,
        evidence: [...(existing?.evidence ?? []), ...newEvidence].slice(-12),
      },
    };
  }

  const endCheck = shouldEndInterview({
    timeCheck,
    aiRecommendedEnd: effectiveAction === 'END_INTERVIEW',
    topicsRemaining,
    questionCount: session.questionCount,
    maxQuestions: MAX_QUESTIONS_HARD_CAP,
  });

  if (endCheck.end || effectiveAction === 'END_INTERVIEW') {
    const updated = await db.interviewSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        endedAt: now,
        endReason: endCheck.reason ?? 'AI_RECOMMENDED_END',
        currentTopic: nextTopic,
        topicsCovered,
        topicsRemaining,
        followUpCountByTopic: followUpCountByTopic as unknown as Prisma.InputJsonValue,
        candidateEvidence: candidateEvidence as unknown as Prisma.InputJsonValue,
      },
      include: { turns: { orderBy: { turnNumber: 'asc' } } },
    });
    return { session: updated, turn: null, ended: true, endReason: updated.endReason ?? undefined };
  }

  const turnNumber = session.questionCount + 1;
  const newTurn = await db.interviewTurn.create({
    data: {
      sessionId: session.id,
      turnNumber,
      topic: nextTopic,
      question: decision.question ?? 'Can you tell me more about that?',
      action: effectiveAction,
      difficulty: decision.difficulty ?? null,
    },
  });

  const updated = await db.interviewSession.update({
    where: { id: session.id },
    data: {
      currentTopic: nextTopic,
      topicsCovered,
      topicsRemaining,
      questionCount: turnNumber,
      followUpCountByTopic: followUpCountByTopic as unknown as Prisma.InputJsonValue,
      candidateEvidence: candidateEvidence as unknown as Prisma.InputJsonValue,
    },
    include: { turns: { orderBy: { turnNumber: 'asc' } } },
  });

  return {
    session: updated,
    turn: {
      id: newTurn.id,
      turnNumber: newTurn.turnNumber,
      topic: newTurn.topic,
      question: newTurn.question,
      action: newTurn.action,
      difficulty: newTurn.difficulty,
    },
    ended: false,
  };
}

/**
 * Generates the very first question. Separate from processAnswer because
 * there's no prior answer to analyze — still goes through applyDecision so
 * topic bookkeeping/end-checks are consistent from turn zero.
 */
export async function startFirstTurn(
  session: SessionWithTurns,
  blueprint: BlueprintLike,
  jobTitle: string,
  context: { interviewId: string; applicationId: string }
): Promise<TurnOutcome> {
  const now = new Date();
  const state = buildCompactState(session, blueprint, jobTitle, now);
  const { decision } = await getNextTurn(state, context);
  return applyDecision(session, blueprint, decision, now);
}

/**
 * Saves the candidate's answer FIRST (task spec §17 — never lose an answer
 * to an AI failure), then asks the AI to analyze it and decide what's next.
 * On AI failure, the answer is already safely persisted; the caller decides
 * how to retry/fall back.
 */
export async function processAnswer(
  session: SessionWithTurns,
  blueprint: BlueprintLike,
  jobTitle: string,
  turnId: string,
  answerText: string,
  context: { interviewId: string; applicationId: string }
): Promise<TurnOutcome> {
  const now = new Date();
  const turn = session.turns.find((t: { id: string }) => t.id === turnId);
  if (!turn) throw new Error('Turn not found in this session');
  if (turn.answeredAt) {
    // Idempotent replay — the answer was already saved and the next turn
    // already generated (e.g. a duplicate submit after a flaky network
    // response). Return current state without calling the AI again.
    const refreshed = await db.interviewSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { turns: { orderBy: { turnNumber: 'asc' } } },
    });
    const nextTurn = refreshed.turns.find((t: { turnNumber: number }) => t.turnNumber === turn.turnNumber + 1) ?? null;
    return {
      session: refreshed,
      turn: nextTurn
        ? {
            id: nextTurn.id,
            turnNumber: nextTurn.turnNumber,
            topic: nextTurn.topic,
            question: nextTurn.question,
            action: nextTurn.action,
            difficulty: nextTurn.difficulty,
          }
        : null,
      ended: refreshed.status === 'COMPLETED',
      endReason: refreshed.endReason ?? undefined,
    };
  }

  await db.interviewTurn.update({ where: { id: turnId }, data: { answerText, answeredAt: now } });
  const sessionWithAnswer = await db.interviewSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { turns: { orderBy: { turnNumber: 'asc' } } },
  });

  const config = durationConfig(blueprint);
  const timeCheck = checkElapsedTime(sessionWithAnswer.startedAt, now, config);
  if (timeCheck.mustEnd) {
    // Enforced in application code regardless of what the AI would have
    // decided (task spec §9) — never depend on the AI to enforce time.
    const ended = await db.interviewSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', endedAt: now, endReason: 'MAX_DURATION_REACHED' },
      include: { turns: { orderBy: { turnNumber: 'asc' } } },
    });
    return { session: ended, turn: null, ended: true, endReason: 'MAX_DURATION_REACHED' };
  }

  const state = buildCompactState(sessionWithAnswer, blueprint, jobTitle, now);
  const { decision } = await getNextTurn(state, context);
  return applyDecision(sessionWithAnswer, blueprint, decision, now);
}

/**
 * Fallback question used when the AI fails after an answer was already
 * safely saved (task spec §17) — keeps the interview moving rather than
 * dead-ending the candidate on a transient provider error.
 */
export async function insertFallbackTurn(session: {
  id: string;
  questionCount: number;
  currentTopic: string | null;
}): Promise<TurnOutcome['turn']> {
  const turnNumber = session.questionCount + 1;
  const newTurn = await db.interviewTurn.create({
    data: {
      sessionId: session.id,
      turnNumber,
      topic: session.currentTopic,
      question: 'Sorry, could you tell me a bit more about that?',
      action: 'CLARIFICATION',
    },
  });
  await db.interviewSession.update({ where: { id: session.id }, data: { questionCount: turnNumber } });
  return {
    id: newTurn.id,
    turnNumber: newTurn.turnNumber,
    topic: newTurn.topic,
    question: newTurn.question,
    action: newTurn.action,
    difficulty: newTurn.difficulty,
  };
}

/**
 * Runs the final AI evaluation from the accumulated evidence profile and
 * writes it into the existing Evaluation/EvaluationScore tables — the same
 * ones STATIC interviews use — so the HR dashboard needs no changes at all
 * to display adaptive-interview results.
 */
export async function finalizeSession(params: {
  sessionId: string;
  applicationId: string;
  interviewId: string;
  jobTitle: string;
  candidateName: string;
  blueprint: BlueprintLike;
}) {
  const session = await db.interviewSession.findUniqueOrThrow({ where: { id: params.sessionId } });

  if (session.status !== 'COMPLETED') {
    await db.interviewSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', endedAt: new Date(), endReason: session.endReason ?? 'CANDIDATE_ENDED_EARLY' },
    });
  }

  const result = await generateAdaptiveEvaluation(
    {
      jobTitle: params.jobTitle,
      candidateName: params.candidateName,
      evaluationAreas: areasOf(params.blueprint),
      candidateEvidence: (session.candidateEvidence as unknown as Record<string, EvidenceEntry>) ?? {},
    },
    { interviewId: params.interviewId, applicationId: params.applicationId }
  );

  // Map each free-form skill area to the closest fixed ScoreCategory bucket
  // so this reuses the existing EvaluationScore model/UI unchanged, rather
  // than adding a parallel scoring shape just for adaptive interviews.
  const scores: { category: 'TECHNICAL' | 'COMPLETENESS'; score: number; rationale?: string }[] = [
    { category: 'TECHNICAL', score: averageOf(result.skillScores) },
    { category: 'COMPLETENESS', score: result.overallScore, rationale: result.recommendation },
  ];

  const evaluation = await db.evaluation.upsert({
    where: { applicationId: params.applicationId },
    update: {
      overallScore: result.overallScore,
      summary: result.summary,
      strengths: result.strengths,
      concerns: result.weaknesses,
      modelName: process.env.AI_PROVIDER ?? 'unknown',
      modelVersion: process.env.AI_MODEL ?? 'default',
      promptVersion: '1.0.0-adaptive',
      status: 'COMPLETED',
      scores: { deleteMany: {}, create: scores },
    },
    create: {
      applicationId: params.applicationId,
      overallScore: result.overallScore,
      summary: result.summary,
      strengths: result.strengths,
      concerns: result.weaknesses,
      modelName: process.env.AI_PROVIDER ?? 'unknown',
      modelVersion: process.env.AI_MODEL ?? 'default',
      promptVersion: '1.0.0-adaptive',
      status: 'COMPLETED',
      scores: { create: scores },
    },
    include: { scores: true },
  });

  await db.application.update({
    where: { id: params.applicationId },
    data: { status: 'EVALUATED', submittedAt: session.endedAt ?? new Date() },
  });

  return { evaluation, skillScores: result.skillScores, recommendation: result.recommendation };
}

function averageOf(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}
