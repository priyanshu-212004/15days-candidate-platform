import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const findManyMock = vi.fn();
const createMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});

vi.mock('@/lib/db', () => ({
  db: {
    candidateExperience: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

import { GET, POST } from './route';
import { UnauthorizedError, ForbiddenError } from '@/lib/authz';

function req(body: unknown) {
  return new Request('https://x.test/api/candidate/profile/experience', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = {
  company: 'Acme',
  title: 'Engineer',
  startDate: '2022-01-01',
  isCurrent: true,
};

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  findManyMock.mockReset();
  createMock.mockReset();
  requireCandidateSessionMock.mockResolvedValue({
    session: { user: { id: 'user-1', userType: 'CANDIDATE' } },
    profile: { id: 'profile-1', userId: 'user-1' },
  });
});

describe('GET /api/candidate/profile/experience', () => {
  it('scopes the query to the caller\'s own profile', async () => {
    findManyMock.mockResolvedValue([]);
    await GET();
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { candidateProfileId: 'profile-1' } })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for a recruiter account', async () => {
    requireCandidateSessionMock.mockRejectedValue(new ForbiddenError());
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

describe('POST /api/candidate/profile/experience', () => {
  it('creates an experience row scoped to the caller\'s own profile', async () => {
    createMock.mockResolvedValue({ id: 'exp-1', ...validBody, candidateProfileId: 'profile-1' });

    const res = await POST(req(validBody));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ candidateProfileId: 'profile-1' }) })
    );
  });

  it('requires an end date unless isCurrent is true', async () => {
    const res = await POST(req({ company: 'Acme', title: 'Engineer', startDate: '2022-01-01', isCurrent: false }));
    expect(res.status).toBe(422);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date', async () => {
    const res = await POST(
      req({ company: 'Acme', title: 'Engineer', startDate: '2022-01-01', endDate: '2021-01-01', isCurrent: false })
    );
    expect(res.status).toBe(422);
  });

  it('rejects a missing company', async () => {
    const res = await POST(req({ title: 'Engineer', startDate: '2022-01-01', isCurrent: true }));
    expect(res.status).toBe(422);
  });

  it('returns 401 when unauthenticated', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
  });
});
