import { describe, it, expect } from 'vitest';
import {
  checkElapsedTime,
  isFollowUpAllowed,
  incrementFollowUpCount,
  advanceToTopic,
  shouldEndInterview,
} from './interview-engine-rules';

const config = { durationTargetMin: 20, durationMinMin: 15, durationMaxMin: 22, graceSeconds: 60 };

describe('checkElapsedTime', () => {
  const started = new Date('2026-01-01T00:00:00Z');

  it('does not flag mustEnd before the max duration', () => {
    const now = new Date('2026-01-01T00:10:00Z');
    const result = checkElapsedTime(started, now, config);
    expect(result.mustEnd).toBe(false);
    expect(result.pastTarget).toBe(false);
  });

  it('flags pastTarget once the target duration is reached, without ending', () => {
    const now = new Date('2026-01-01T00:21:00Z');
    const result = checkElapsedTime(started, now, config);
    expect(result.pastTarget).toBe(true);
    expect(result.mustEnd).toBe(false);
  });

  it('flags mustEnd once the max duration is reached', () => {
    const now = new Date('2026-01-01T00:22:01Z');
    const result = checkElapsedTime(started, now, config);
    expect(result.mustEnd).toBe(true);
    expect(result.reason).toBe('MAX_DURATION_REACHED');
  });

  it('extends by graceSeconds exactly once when inGraceAnswer is true', () => {
    const now = new Date('2026-01-01T00:22:30Z'); // 22:30 > max(22:00) but < max+grace(23:00)
    const withoutGrace = checkElapsedTime(started, now, config, false);
    const withGrace = checkElapsedTime(started, now, config, true);
    expect(withoutGrace.mustEnd).toBe(true);
    expect(withGrace.mustEnd).toBe(false);
  });
});

describe('isFollowUpAllowed / incrementFollowUpCount', () => {
  it('allows a follow-up when under the per-topic max', () => {
    expect(isFollowUpAllowed({ React: 1 }, 'React', 2)).toBe(true);
  });

  it('blocks a follow-up once the per-topic max is reached', () => {
    expect(isFollowUpAllowed({ React: 2 }, 'React', 2)).toBe(false);
  });

  it('treats an unseen topic as zero follow-ups so far', () => {
    expect(isFollowUpAllowed({}, 'React', 2)).toBe(true);
  });

  it('increments only the given topic, leaving others untouched', () => {
    const result = incrementFollowUpCount({ React: 1, JavaScript: 3 }, 'React');
    expect(result).toEqual({ React: 2, JavaScript: 3 });
  });
});

describe('advanceToTopic', () => {
  it('marks the previous topic covered and removes the new one from remaining', () => {
    const result = advanceToTopic(
      { currentTopic: 'React', topicsCovered: [], topicsRemaining: ['JavaScript', 'System Design'] },
      'JavaScript'
    );
    expect(result).toEqual({
      currentTopic: 'JavaScript',
      topicsCovered: ['React'],
      topicsRemaining: ['System Design'],
    });
  });

  it('handles the very first topic (no currentTopic yet)', () => {
    const result = advanceToTopic(
      { currentTopic: null, topicsCovered: [], topicsRemaining: ['React', 'JavaScript'] },
      'React'
    );
    expect(result).toEqual({ currentTopic: 'React', topicsCovered: [], topicsRemaining: ['JavaScript'] });
  });

  it('does not duplicate a topic already marked covered', () => {
    const result = advanceToTopic(
      { currentTopic: 'React', topicsCovered: ['React'], topicsRemaining: ['JavaScript'] },
      'JavaScript'
    );
    expect(result.topicsCovered).toEqual(['React']);
  });
});

describe('shouldEndInterview', () => {
  const baseTimeCheck = { elapsedSec: 600, mustEnd: false, pastTarget: false };

  it('ends when max duration is reached, regardless of anything else', () => {
    const result = shouldEndInterview({
      timeCheck: { ...baseTimeCheck, mustEnd: true, reason: 'MAX_DURATION_REACHED' },
      aiRecommendedEnd: false,
      topicsRemaining: ['React'],
      questionCount: 3,
      maxQuestions: 40,
    });
    expect(result).toEqual({ end: true, reason: 'MAX_DURATION_REACHED' });
  });

  it('ends when the hard question-count cap is hit', () => {
    const result = shouldEndInterview({
      timeCheck: baseTimeCheck,
      aiRecommendedEnd: false,
      topicsRemaining: ['React'],
      questionCount: 40,
      maxQuestions: 40,
    });
    expect(result).toEqual({ end: true, reason: 'MAX_QUESTIONS_REACHED' });
  });

  it('does NOT end on AI recommendation alone before the target duration', () => {
    const result = shouldEndInterview({
      timeCheck: baseTimeCheck, // pastTarget: false
      aiRecommendedEnd: true,
      topicsRemaining: ['React'],
      questionCount: 3,
      maxQuestions: 40,
    });
    expect(result.end).toBe(false);
  });

  it('ends on AI recommendation once past the target duration', () => {
    const result = shouldEndInterview({
      timeCheck: { ...baseTimeCheck, pastTarget: true },
      aiRecommendedEnd: true,
      topicsRemaining: ['React'],
      questionCount: 6,
      maxQuestions: 40,
    });
    expect(result).toEqual({ end: true, reason: 'AI_RECOMMENDED_END' });
  });

  it('ends when all topics are covered and past target duration', () => {
    const result = shouldEndInterview({
      timeCheck: { ...baseTimeCheck, pastTarget: true },
      aiRecommendedEnd: false,
      topicsRemaining: [],
      questionCount: 8,
      maxQuestions: 40,
    });
    expect(result).toEqual({ end: true, reason: 'ALL_TOPICS_COVERED' });
  });

  it('continues when topics remain and duration is still under target', () => {
    const result = shouldEndInterview({
      timeCheck: baseTimeCheck,
      aiRecommendedEnd: false,
      topicsRemaining: ['System Design'],
      questionCount: 4,
      maxQuestions: 40,
    });
    expect(result).toEqual({ end: false });
  });
});
