import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiConfigError, AiGenerationError } from '@/lib/ai-provider';

const resolveCandidateSessionMock = vi.fn();
const interviewFindUniqueMock = vi.fn();
const applicationUpdateMock = vi.fn();
const getOrCreateSessionMock = vi.fn();
const startFirstTurnMock = vi.fn();
const insertFallbackTurnMock = vi.fn();

vi.mock('@/lib/queries/candidate-session', () => ({
  resolveCandidateSession: (...args: unknown[]) => resolveCandidateSessionMock(...args),
}));

vi.mock('@/lib/db', () => ({
  db: {
    interview: { findUnique: (...args: unknown[]) => interviewFindUniqueMock(...args) },
    application: { update: (...args: unknown[]) => applicationUpdateMock(...args) },
  },
}));

vi.mock('@/lib/adaptive-session', () => ({
  getOrCreateSession: (...args: unknown[]) => getOrCreateSessionMock(...args),
  startFirstTurn: (...args: unknown[]) => startFirstTurnMock(...args),
  insertFallbackTurn: (...args: unknown[]) => insertFallbackTurnMock(...args),
  AiConfigError,
  AiGenerationError,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSec: 0, limit: 20 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

import { POST } from './route';

const adaptiveApplication = {
  id: 'app-1',
  status: 'PENDING',
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

function makeRequest() {
  return new Request('https://example.test/api/public/interviews/tok/adaptive/start', { method: 'POST' });
}

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  interviewFindUniqueMock.mockReset();
  applicationUpdateMock.mockReset();
  getOrCreateSessionMock.mockReset();
  startFirstTurnMock.mockReset();
  insertFallbackTurnMock.mockReset();

  resolveCandidateSessionMock.mockResolvedValue(adaptiveApplication);
  interviewFindUniqueMock.mockResolvedValue(interviewWithBlueprint);
  applicationUpdateMock.mockResolvedValue({});
});

describe('POST /adaptive/start', () => {
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

  it('rejects when the interview has already been submitted', async () => {
    resolveCandidateSessionMock.mockResolvedValue({ ...adaptiveApplication, status: 'EVALUATED' });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    expect(res.status).toBe(409);
  });

  it('returns 500 when the interview has no blueprint configured', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...interviewWithBlueprint, blueprint: null });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    expect(res.status).toBe(500);
  });

  it('marks a PENDING application IN_PROGRESS before starting', async () => {
    getOrCreateSessionMock.mockResolvedValue({ id: 'sess-1', status: 'IN_PROGRESS', turns: [], startedAt: new Date() });
    startFirstTurnMock.mockResolvedValue({
      session: { status: 'IN_PROGRESS' },
      turn: { id: 'turn-1', turnNumber: 1, topic: 'React', question: 'Tell me about React.' },
    });
    await POST(makeRequest(), { params: { token: 'tok' } });
    expect(applicationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'app-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    });
  });

  it('resumes an unanswered turn instead of generating a new question (refresh-safe)', async () => {
    const startedAt = new Date(Date.now() - 60_000);
    getOrCreateSessionMock.mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      startedAt,
      turns: [{ id: 'turn-1', turnNumber: 1, topic: 'React', question: 'Existing question?', answeredAt: null }],
    });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.turn.id).toBe('turn-1');
    expect(startFirstTurnMock).not.toHaveBeenCalled();
  });

  it('returns COMPLETED with no turn when the session is already finished', async () => {
    getOrCreateSessionMock.mockResolvedValue({ id: 'sess-1', status: 'COMPLETED', turns: [], startedAt: new Date() });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    const data = await res.json();
    expect(data.sessionStatus).toBe('COMPLETED');
    expect(data.turn).toBeNull();
  });

  it('generates the first question via startFirstTurn on a fresh session', async () => {
    getOrCreateSessionMock.mockResolvedValue({ id: 'sess-1', status: 'IN_PROGRESS', turns: [], startedAt: new Date() });
    startFirstTurnMock.mockResolvedValue({
      session: { status: 'IN_PROGRESS' },
      turn: { id: 'turn-1', turnNumber: 1, topic: 'React', question: 'Tell me about React.' },
    });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.turn.question).toBe('Tell me about React.');
    expect(data.targetSec).toBe(blueprint.durationTargetMin * 60);
    expect(data.maxSec).toBe(blueprint.durationMaxMin * 60);
  });

  it('returns 503 when the AI provider is not configured', async () => {
    getOrCreateSessionMock.mockResolvedValue({ id: 'sess-1', status: 'IN_PROGRESS', turns: [], startedAt: new Date() });
    startFirstTurnMock.mockRejectedValue(new AiConfigError('no key'));
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    expect(res.status).toBe(503);
  });

  it('falls back to a safe question when AI generation fails, and never loses the candidate', async () => {
    getOrCreateSessionMock.mockResolvedValue({ id: 'sess-1', status: 'IN_PROGRESS', turns: [], startedAt: new Date() });
    startFirstTurnMock.mockRejectedValue(new AiGenerationError('bad response'));
    insertFallbackTurnMock.mockResolvedValue({
      id: 'fallback-1',
      turnNumber: 1,
      topic: null,
      question: 'Sorry, could you tell me a bit more about that?',
    });
    const res = await POST(makeRequest(), { params: { token: 'tok' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.degraded).toBe(true);
    expect(data.turn.id).toBe('fallback-1');
  });
});
