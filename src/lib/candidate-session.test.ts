import { describe, it, expect } from 'vitest';
import { computeProgress, canModifySession, canSubmit } from './candidate-session';

describe('computeProgress', () => {
  it('reports zero progress when nothing is answered', () => {
    const result = computeProgress(['q1', 'q2', 'q3'], []);
    expect(result).toEqual({
      answeredCount: 0,
      totalCount: 3,
      isComplete: false,
      nextUnansweredQuestionId: 'q1',
    });
  });

  it('tracks partial progress and points to the next unanswered question in order', () => {
    const result = computeProgress(
      ['q1', 'q2', 'q3'],
      [
        { questionId: 'q1', answered: true },
        { questionId: 'q2', answered: false },
      ]
    );
    expect(result.answeredCount).toBe(1);
    expect(result.isComplete).toBe(false);
    expect(result.nextUnansweredQuestionId).toBe('q2');
  });

  it('is complete only when every question has been answered', () => {
    const result = computeProgress(
      ['q1', 'q2'],
      [
        { questionId: 'q1', answered: true },
        { questionId: 'q2', answered: true },
      ]
    );
    expect(result.isComplete).toBe(true);
    expect(result.nextUnansweredQuestionId).toBeNull();
  });

  it('is never complete for an interview with zero questions', () => {
    const result = computeProgress([], []);
    expect(result.isComplete).toBe(false);
    expect(result.totalCount).toBe(0);
  });

  it('ignores answer rows for questions that are no longer part of the interview', () => {
    const result = computeProgress(
      ['q1'],
      [
        { questionId: 'q1', answered: true },
        { questionId: 'stale-question', answered: true },
      ]
    );
    expect(result.answeredCount).toBe(1);
    expect(result.isComplete).toBe(true);
  });
});

describe('canModifySession', () => {
  it('allows modification while PENDING or IN_PROGRESS', () => {
    expect(canModifySession('PENDING')).toBe(true);
    expect(canModifySession('IN_PROGRESS')).toBe(true);
  });

  it('blocks modification once SUBMITTED or EVALUATED', () => {
    expect(canModifySession('SUBMITTED')).toBe(false);
    expect(canModifySession('EVALUATED')).toBe(false);
  });
});

describe('canSubmit', () => {
  const completeProgress = { answeredCount: 2, totalCount: 2, isComplete: true, nextUnansweredQuestionId: null };
  const incompleteProgress = { answeredCount: 1, totalCount: 2, isComplete: false, nextUnansweredQuestionId: 'q2' };

  it('accepts a complete, open session as a fresh submission', () => {
    const result = canSubmit('IN_PROGRESS', completeProgress);
    expect(result).toEqual({ ok: true, alreadySubmitted: false });
  });

  it('rejects submission when required answers are missing', () => {
    const result = canSubmit('IN_PROGRESS', incompleteProgress);
    expect(result).toEqual({ ok: false, reason: 'NOT_COMPLETE' });
  });

  it('treats an already-submitted session as an idempotent success, not an error', () => {
    const result = canSubmit('SUBMITTED', incompleteProgress);
    expect(result).toEqual({ ok: true, alreadySubmitted: true });
  });

  it('treats an already-evaluated session the same way (idempotent replay)', () => {
    const result = canSubmit('EVALUATED', completeProgress);
    expect(result).toEqual({ ok: true, alreadySubmitted: true });
  });

  it('rejects re-submission attempts framed as PENDING with nothing answered', () => {
    const result = canSubmit('PENDING', { answeredCount: 0, totalCount: 2, isComplete: false, nextUnansweredQuestionId: 'q1' });
    expect(result).toEqual({ ok: false, reason: 'NOT_COMPLETE' });
  });
});
