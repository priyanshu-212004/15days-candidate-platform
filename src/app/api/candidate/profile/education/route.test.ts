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
    candidateEducation: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

import { GET, POST } from './route';
import { UnauthorizedError } from '@/lib/authz';

function req(body: unknown) {
  return new Request('https://x.test/api/candidate/profile/education', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = { degree: 'B.Tech', institution: 'State University', graduationYear: 2022 };

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  findManyMock.mockReset();
  createMock.mockReset();
  requireCandidateSessionMock.mockResolvedValue({
    session: { user: { id: 'user-1', userType: 'CANDIDATE' } },
    profile: { id: 'profile-1', userId: 'user-1' },
  });
});

describe('GET /api/candidate/profile/education', () => {
  it("scopes the query to the caller's own profile", async () => {
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
});

describe('POST /api/candidate/profile/education', () => {
  it("creates a row scoped to the caller's own profile", async () => {
    createMock.mockResolvedValue({ id: 'edu-1', ...validBody, candidateProfileId: 'profile-1' });

    const res = await POST(req(validBody));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ candidateProfileId: 'profile-1' }) })
    );
  });

  it('rejects a missing degree', async () => {
    const res = await POST(req({ institution: 'State University' }));
    expect(res.status).toBe(422);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects an unreasonable graduation year', async () => {
    const res = await POST(req({ degree: 'B.Tech', institution: 'X', graduationYear: 1800 }));
    expect(res.status).toBe(422);
  });
});
