import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireOrgMemberMock = vi.fn();
const interviewFindUniqueMock = vi.fn();
const blueprintUpsertMock = vi.fn();
const writeAuditLogMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return {
    ...actual,
    requireOrgMember: (...args: unknown[]) => requireOrgMemberMock(...args),
    writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    interview: { findUnique: (...args: unknown[]) => interviewFindUniqueMock(...args) },
    interviewBlueprint: { upsert: (...args: unknown[]) => blueprintUpsertMock(...args) },
  },
}));

import { GET, PUT } from './route';

const draftAdaptiveInterview = { id: 'interview-1', orgId: 'org-1', interviewType: 'ADAPTIVE_VOICE', status: 'DRAFT' };

const validBody = {
  durationTargetMin: 20,
  durationMinMin: 15,
  durationMaxMin: 22,
  graceSeconds: 60,
  maxFollowUpsPerTopic: 2,
  evaluationAreas: [
    { name: 'React', weight: 60 },
    { name: 'System Design', weight: 40 },
  ],
};

function makePutRequest(body: unknown) {
  return new Request('https://example.test/api/interviews/interview-1/blueprint', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireOrgMemberMock.mockReset();
  interviewFindUniqueMock.mockReset();
  blueprintUpsertMock.mockReset();
  writeAuditLogMock.mockReset();

  requireOrgMemberMock.mockResolvedValue({ orgId: 'org-1', session: { user: { id: 'user-1' } }, role: 'RECRUITER' });
  interviewFindUniqueMock.mockResolvedValue(draftAdaptiveInterview);
});

describe('GET /interviews/:id/blueprint', () => {
  it('returns the blueprint (or null) for a valid interview', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...draftAdaptiveInterview, blueprint: null });
    const res = await GET(new Request('https://example.test'), { params: { interviewId: 'interview-1' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.blueprint).toBeNull();
  });

  it('rejects cross-org access', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...draftAdaptiveInterview, orgId: 'other-org', blueprint: null });
    const res = await GET(new Request('https://example.test'), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(403);
  });
});

describe('PUT /interviews/:id/blueprint', () => {
  it('rejects a STATIC interview', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...draftAdaptiveInterview, interviewType: 'STATIC' });
    const res = await PUT(makePutRequest(validBody), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(409);
  });

  it('rejects editing once the interview is no longer a draft', async () => {
    interviewFindUniqueMock.mockResolvedValue({ ...draftAdaptiveInterview, status: 'ACTIVE' });
    const res = await PUT(makePutRequest(validBody), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(409);
  });

  it('rejects malformed input', async () => {
    const res = await PUT(makePutRequest({ evaluationAreas: [] }), { params: { interviewId: 'interview-1' } });
    expect(res.status).toBe(422);
  });

  it('rejects weights that do not sum to 100', async () => {
    const res = await PUT(
      makePutRequest({ ...validBody, evaluationAreas: [{ name: 'React', weight: 50 }] }),
      { params: { interviewId: 'interview-1' } }
    );
    const data = await res.json();
    expect(res.status).toBe(422);
    expect(data.error).toMatch(/sum to 100/);
  });

  it('rejects duration settings where min > target or target > max', async () => {
    const res = await PUT(
      makePutRequest({ ...validBody, durationMinMin: 25 }),
      { params: { interviewId: 'interview-1' } }
    );
    const data = await res.json();
    expect(res.status).toBe(422);
    expect(data.error).toMatch(/minimum.*target.*maximum/i);
  });

  it('saves a valid blueprint', async () => {
    blueprintUpsertMock.mockResolvedValue({ id: 'bp-1', ...validBody });
    const res = await PUT(makePutRequest(validBody), { params: { interviewId: 'interview-1' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.blueprint.evaluationAreas).toHaveLength(2);
    expect(blueprintUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { interviewId: 'interview-1' } })
    );
    expect(writeAuditLogMock).toHaveBeenCalled();
  });
});
