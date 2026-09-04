import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const findManyMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});
vi.mock('@/lib/db', () => ({ db: { application: { findMany: (...args: unknown[]) => findManyMock(...args) } } }));

import { GET } from './route';
import { UnauthorizedError } from '@/lib/authz';

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  findManyMock.mockReset();
  requireCandidateSessionMock.mockResolvedValue({ session: { user: { id: 'user-1', userType: 'CANDIDATE' } } });
  findManyMock.mockResolvedValue([]);
});

describe('GET /api/candidate/applications', () => {
  it("scopes the query to applications whose candidate.userId is this session's user", async () => {
    await GET();
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { candidate: { userId: 'user-1' } } })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
