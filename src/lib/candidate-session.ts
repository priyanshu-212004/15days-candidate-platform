/**
 * Pure candidate-session logic — no cookies, no DB. Kept separate so it can
 * be unit tested directly, mirroring the interview-availability.ts pattern.
 */

export type CandidateSessionStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED';

export interface QuestionAnswerState {
  questionId: string;
  answered: boolean;
}

export interface ProgressResult {
  answeredCount: number;
  totalCount: number;
  isComplete: boolean;
  nextUnansweredQuestionId: string | null;
}

export function computeProgress(
  questionIds: string[],
  answers: QuestionAnswerState[]
): ProgressResult {
  const answeredSet = new Set(answers.filter((a) => a.answered).map((a) => a.questionId));
  const answeredCount = questionIds.filter((id) => answeredSet.has(id)).length;
  const nextUnanswered = questionIds.find((id) => !answeredSet.has(id)) ?? null;

  return {
    answeredCount,
    totalCount: questionIds.length,
    isComplete: answeredCount === questionIds.length && questionIds.length > 0,
    nextUnansweredQuestionId: nextUnanswered,
  };
}

/** A session accepts new answers only while it's still open. */
export function canModifySession(status: CandidateSessionStatus): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS';
}

/** Submission is only valid from an open, fully-answered session — or is a no-op replay of an already-submitted one. */
export type SubmitCheckResult =
  | { ok: true; alreadySubmitted: boolean }
  | { ok: false; reason: 'NOT_COMPLETE' | 'SESSION_CLOSED' };

export function canSubmit(status: CandidateSessionStatus, progress: ProgressResult): SubmitCheckResult {
  if (status === 'SUBMITTED' || status === 'EVALUATED') {
    return { ok: true, alreadySubmitted: true };
  }
  if (!canModifySession(status)) {
    return { ok: false, reason: 'SESSION_CLOSED' };
  }
  if (!progress.isComplete) {
    return { ok: false, reason: 'NOT_COMPLETE' };
  }
  return { ok: true, alreadySubmitted: false };
}
