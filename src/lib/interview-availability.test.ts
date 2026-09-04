import { describe, it, expect } from 'vitest';
import { evaluateInterviewAvailability } from './interview-availability';

const now = new Date('2026-01-01T00:00:00Z');

describe('evaluateInterviewAvailability', () => {
  it('rejects a missing interview (invalid/unknown token)', () => {
    const result = evaluateInterviewAvailability(null, now);
    expect(result).toEqual({ available: false, reason: 'NOT_FOUND' });
  });

  it('rejects an expired interview even if status is still ACTIVE', () => {
    const result = evaluateInterviewAvailability(
      { status: 'ACTIVE', expiresAt: new Date('2025-12-31T00:00:00Z'), questionCount: 5 },
      now
    );
    expect(result).toEqual({ available: false, reason: 'EXPIRED' });
  });

  it('rejects a DRAFT interview (not yet published)', () => {
    const result = evaluateInterviewAvailability({ status: 'DRAFT', expiresAt: null, questionCount: 5 }, now);
    expect(result).toEqual({ available: false, reason: 'INACTIVE' });
  });

  it('rejects a PAUSED (deactivated) interview', () => {
    const result = evaluateInterviewAvailability({ status: 'PAUSED', expiresAt: null, questionCount: 5 }, now);
    expect(result).toEqual({ available: false, reason: 'INACTIVE' });
  });

  it('rejects an ACTIVE interview with zero questions', () => {
    const result = evaluateInterviewAvailability({ status: 'ACTIVE', expiresAt: null, questionCount: 0 }, now);
    expect(result).toEqual({ available: false, reason: 'NO_QUESTIONS' });
  });

  it('accepts an ACTIVE interview with questions and no expiration', () => {
    const result = evaluateInterviewAvailability({ status: 'ACTIVE', expiresAt: null, questionCount: 3 }, now);
    expect(result).toEqual({ available: true });
  });

  it('accepts an ACTIVE interview with a future expiration date', () => {
    const result = evaluateInterviewAvailability(
      { status: 'ACTIVE', expiresAt: new Date('2026-06-01T00:00:00Z'), questionCount: 3 },
      now
    );
    expect(result).toEqual({ available: true });
  });
});
