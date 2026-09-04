import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiConfigError, AiGenerationError } from '@/lib/ai-provider';

const requireOrgMemberMock = vi.fn();
const interviewFindUniqueMock = vi.fn();
const suggestBlueprintMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return {
    ...actual,
    requireOrgMember: (...args: unknown[]) => requireOrgMemberMock(...args),
  };
});

vi.mock('@/lib/db', () => ({
  db: { interview: { findUnique: (...args: unknown[]) => interviewFindUniqueMock(...args) } },
}));

vi.mock('@/lib/interview-engine', () => ({
  suggestBlueprint: (...args: unknown[]) => suggestBlueprintMock(...args),
  AiConfigError,
  AiGenerationError,
}));

import { POST } from './route';

const draftAdaptiveInterview = {
  id: 'interview-1',
  orgId: 'org-1',
  interviewType: 'ADAPTIVE_VOICE',
  status: 'DRAFT',
  job: {
    title: 'Senior Backend Engineer',
    description: 'Build scalable systems.',
    requirements: ['5+ years experience'],
    skills: ['Node.js', 'Kafka'],
    experienceLevel: 'senior',
  },
};

function makeRequest() {
  return new Request('https://example.test/api/interviews/interview-1/blueprint/suggest', { method: 'POST' });
}

beforeEach(() => {
  requireOrgMemberMock.mockReset();
  interviewFindUniqueMock.mockReset();
  suggestBlueprintMock.mockReset();

  requireOrgMemberMock.mockResolvedValue({ orgId: 'org-1', session: { user: { id: 'user-1' } }, role: 'RECRUITER' });
  interviewFindUniqueMock.mockResolvedValue(draftAdaptiveInterview);
});

describe('POST /interviews/:id/blueprint/suggest', () => {
  it('returns 404 when the interview does not exist', async () => {
    interviewFindUniqueMock.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(404);
  });

  it('rejects an interview from a different organization', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...draftAdaptiveInterview, orgId: 'other-org' });
    const res = await POST(makeRequest(), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(403);
  });

  it('rejects a STATIC interview — blueprint suggestion is adaptive-only', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...draftAdaptiveInterview, interviewType: 'STATIC' });
    const res = await POST(makeRequest(), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(409);
  });

  it('rejects once the interview is no longer a draft', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...draftAdaptiveInterview, status: 'ACTIVE' });
    const res = await POST(makeRequest(), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(409);
  });

  it('returns suggested evaluation areas on success', async () => {
    suggestBlueprintMock.mockResolvedValue([
      { name: 'System Design', weight: 40 },
      { name: 'Node.js', weight: 60 },
    ]);
    const res = await POST(makeRequest(), { params: { interviewId: 'interview-1' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.evaluationAreas).toHaveLength(2);
  });

  it('returns 503 when the AI provider is not configured', async () => {
    suggestBlueprintMock.mockRejectedValue(new AiConfigError('no key'));
    const res = await POST(makeRequest(), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(503);
  });

  it('returns 502 when the AI response is unusable', async () => {
    suggestBlueprintMock.mockRejectedValue(new AiGenerationError('bad json'));
    const res = await POST(makeRequest(), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(502);
  });
});
