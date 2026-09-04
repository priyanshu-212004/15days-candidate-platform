import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiConfigError, AiGenerationError } from '@/lib/ai-provider';

const resolveCandidateSessionMock = vi.fn();
const interviewFindUniqueMock = vi.fn();
const sessionFindUniqueMock = vi.fn();
const sessionFindUniqueOrThrowMock = vi.fn();
const processAnswerMock = vi.fn();
const insertFallbackTurnMock = vi.fn();
const finalizeSessionMock = vi.fn();

vi.mock('@/lib/queries/candidate-session', () => ({
  resolveCandidateSession: (...args: unknown[]) => resolveCandidateSessionMock(...args),
}));

vi.mock('@/lib/db', () => ({
  db: {
    interview: { findUnique: (...args: unknown[]) => interviewFindUniqueMock(...args) },
    interviewSession: {
      findUnique: (...args: unknown[]) => sessionFindUniqueMock(...args),
      findUniqueOrThrow: (...args: unknown[]) => sessionFindUniqueOrThrowMock(...args),
    },
  },
}));

vi.mock('@/lib/adaptive-session', () => ({
  processAnswer: (...args: unknown[]) => processAnswerMock(...args),
  insertFallbackTurn: (...args: unknown[]) => insertFallbackTurnMock(...args),
  finalizeSession: (...args: unknown[]) => finalizeSessionMock(...args),
  AiConfigError,
  AiGenerationError,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSec: 0, limit: 20 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

import { POST } from './route';

const VALID_TURN_ID = '11111111-1111-4111-8111-111111111111';

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

const interviewWithBlueprint = { id: 'interview-1', blueprint, job: { title: 'Senior Engineer' } };

const sessionInProgress = {
  id: 'sess-1',
  status: 'IN_PROGRESS',
  startedAt: new Date(),
  turns: [{ id: VALID_TURN_ID, turnNumber: 1, topic: 'React', question: 'Tell me about React.', answeredAt: null }],
};

function makeRequest(body: unknown) {
  return new Request('https://example.test/api/public/interviews/tok/adaptive/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  interviewFindUniqueMock.mockReset();
  sessionFindUniqueMock.mockReset();
  sessionFindUniqueOrThrowMock.mockReset();
  processAnswerMock.mockReset();
  insertFallbackTurnMock.mockReset();
  finalizeSessionMock.mockReset();

  resolveCandidateSessionMock.mockResolvedValue(adaptiveApplication);
  interviewFindUniqueMock.mockResolvedValue(interviewWithBlueprint);
  sessionFindUniqueMock.mockResolvedValue(sessionInProgress);
});

const validBody = { turnId: VALID_TURN_ID, answerText: 'I built a payment system using Kafka.' };

describe('POST /adaptive/turn', () => {
  it('rejects when there is no active candidate session', async () => {
    resolveCandidateSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(res.status).toBe(401);
  });

  it('rejects a STATIC interview — this route is adaptive-only', async () => {
    resolveCandidateSessionMock.mockResolvedValue({
      ...adaptiveApplication,
      interview: { id: 'interview-1', interviewType: 'STATIC' },
    });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(res.status).toBe(409);
  });

  it('rejects a malformed body (missing/invalid fields)', async () => {
    const res = await POST(makeRequest({ turnId: 'not-a-uuid' }), { params: { token: 'tok' } });
    expect(res.status).toBe(422);
  });

  it('rejects a turnId that does not belong to the candidate\'s own session (defense in depth)', async () => {
    const res = await POST(
      makeRequest({ turnId: '22222222-2222-4222-8222-222222222222', answerText: 'hi' }),
      { params: { token: 'tok' } }
    );
    expect(res.status).toBe(403);
    expect(processAnswerMock).not.toHaveBeenCalled();
  });

  it('returns the next question when the interview continues', async () => {
    processAnswerMock.mockResolvedValue({
      session: { id: 'sess-1', status: 'IN_PROGRESS' },
      turn: { id: 'turn-2', turnNumber: 2, topic: 'React', question: 'How do you handle retries?' },
      ended: false,
    });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.turn.question).toBe('How do you handle retries?');
    expect(finalizeSessionMock).not.toHaveBeenCalled();
  });

  it('finalizes and writes the evaluation when the engine/rules decide to end the interview', async () => {
    processAnswerMock.mockResolvedValue({
      session: { id: 'sess-1', status: 'COMPLETED' },
      turn: null,
      ended: true,
      endReason: 'ALL_TOPICS_COVERED',
    });
    finalizeSessionMock.mockResolvedValue({
      evaluation: { overallScore: 8.2 },
      skillScores: { React: 8 },
      recommendation: 'Strong candidate',
    });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.sessionStatus).toBe('COMPLETED');
    expect(data.evaluation.overallScore).toBe(8.2);
    expect(finalizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'app-1', interviewId: 'interview-1', candidateName: 'Ada Lovelace' })
    );
  });

  it('returns 503 when the AI provider is not configured', async () => {
    processAnswerMock.mockRejectedValue(new AiConfigError('no key'));
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(res.status).toBe(503);
  });

  it('falls back to a safe follow-up when AI generation fails — the answer is never lost', async () => {
    processAnswerMock.mockRejectedValue(new AiGenerationError('bad response'));
    sessionFindUniqueOrThrowMock.mockResolvedValue({ ...sessionInProgress, status: 'IN_PROGRESS' });
    insertFallbackTurnMock.mockResolvedValue({
      id: 'fallback-1',
      turnNumber: 2,
      topic: 'React',
      question: 'Sorry, could you tell me a bit more about that?',
    });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.degraded).toBe(true);
    expect(data.turn.id).toBe('fallback-1');
  });

  it('returns COMPLETED with no turn if the session had already ended by the time the fallback path checks', async () => {
    processAnswerMock.mockRejectedValue(new AiGenerationError('bad response'));
    sessionFindUniqueOrThrowMock.mockResolvedValue({ ...sessionInProgress, status: 'COMPLETED' });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    const data = await res.json();
    expect(data.sessionStatus).toBe('COMPLETED');
    expect(insertFallbackTurnMock).not.toHaveBeenCalled();
  });
});
