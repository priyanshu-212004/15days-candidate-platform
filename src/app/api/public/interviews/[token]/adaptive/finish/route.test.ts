import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveCandidateSessionMock = vi.fn();
const interviewFindUniqueMock = vi.fn();
const sessionFindUniqueMock = vi.fn();
const evaluationFindUniqueMock = vi.fn();
const finalizeSessionMock = vi.fn();

vi.mock('@/lib/queries/candidate-session', () => ({
  resolveCandidateSession: (...args: unknown[]) => resolveCandidateSessionMock(...args),
}));

vi.mock('@/lib/db', () => ({
  db: {
    interview: { findUnique: (...args: unknown[]) => interviewFindUniqueMock(...args) },
    interviewSession: { findUnique: (...args: unknown[]) => sessionFindUniqueMock(...args) },
    evaluation: { findUnique: (...args: unknown[]) => evaluationFindUniqueMock(...args) },
  },
}));

vi.mock('@/lib/adaptive-session', () => ({
  finalizeSession: (...args: unknown[]) => finalizeSessionMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSec: 0, limit: 20 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

import { POST } from './route';

const adaptiveApplication = {
  id: 'app-1',
  status: 'IN_PROGRESS',
  candidate: { name: 'Ada Lovelace' },
  interview: { id: 'interview-1', interviewType: 'ADAPTIVE_VOICE' },
};

const blueprint = {
  durationTargetMin: 20,
  durationMinMin: 15,
  durationMaxMin: 22,
  graceSeconds: 60,
  maxFollowUpsPerTopic: 2,
  evaluationAreas: [{ name: 'React', weight: 100 }],
};

function makeRequest() {
  return new Request('https://example.test/api/public/interviews/tok/adaptive/finish', { method: 'POST' });
}

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  interviewFindUniqueMock.mockReset();
  sessionFindUniqueMock.mockReset();
  evaluationFindUniqueMock.mockReset();
  finalizeSessionMock.mockReset();

  resolveCandidateSessionMock.mockResolvedValue(adaptiveApplication);
  interviewFindUniqueMock.mockResolvedValue({ id: 'interview-1', blueprint, job: { title: 'Senior Engineer' } });
  sessionFindUniqueMock.mockResolvedValue({ id: 'sess-1' });
  evaluationFindUniqueMock.mockResolvedValue(null);
});

describe('POST /adaptive/finish', () => {
  it('rejects when there is no active candidate session', async () => {
    resolveCandidateSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    expect(res.status).toBe(401);
  });

  it('rejects a STATIC interview — this route is adaptive-only', async () => {
    resolveCandidateSessionMock.mockResolvedValue({
      ...adaptiveApplication,
      interview: { id: 'interview-1', interviewType: 'STATIC' },
    });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    expect(res.status).toBe(409);
  });

  it('is idempotent when already submitted/evaluated', async () => {
    resolveCandidateSessionMock.mockResolvedValue({ ...adaptiveApplication, status: 'EVALUATED' });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.sessionStatus).toBe('COMPLETED');
    expect(finalizeSessionMock).not.toHaveBeenCalled();
  });

  it('does not regenerate an already-completed evaluation (duplicate submit protection)', async () => {
    evaluationFindUniqueMock.mockResolvedValue({ status: 'COMPLETED', overallScore: 7.5 });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.evaluation.overallScore).toBe(7.5);
    expect(finalizeSessionMock).not.toHaveBeenCalled();
  });

  it('finalizes the session and returns the evaluation summary', async () => {
    finalizeSessionMock.mockResolvedValue({
      evaluation: { overallScore: 6.9 },
      skillScores: { React: 7 },
      recommendation: 'Good fit',
    });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.evaluation.overallScore).toBe(6.9);
    expect(data.evaluation.recommendation).toBe('Good fit');
    expect(finalizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-1', applicationId: 'app-1', candidateName: 'Ada Lovelace' })
    );
  });

  it('returns 502 with a clear message if finalization fails, without leaving the candidate stuck', async () => {
    finalizeSessionMock.mockRejectedValue(new Error('AI evaluation failed'));
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    expect(res.status).toBe(502);
  });
});
