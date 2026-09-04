import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const listMarketplaceJobsMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/queries/candidate-jobs', () => ({
  listMarketplaceJobs: (...args: unknown[]) => listMarketplaceJobsMock(...args),
}));

import { GET } from './route';
import { UnauthorizedError } from '@/lib/authz';

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  listMarketplaceJobsMock.mockReset();
  requireCandidateSessionMock.mockResolvedValue({ session: { user: { id: 'user-1', userType: 'CANDIDATE' } } });
  listMarketplaceJobsMock.mockResolvedValue({ jobs: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
});

function req(qs: string) {
  return new Request(`https://x.test/api/candidate/jobs${qs}`);
}

describe('GET /api/candidate/jobs', () => {
  it('parses query params and forwards them to listMarketplaceJobs', async () => {
    const res = await req('?q=engineer&workMode=REMOTE&page=2');
    await GET(res);
    expect(listMarketplaceJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'engineer', workMode: 'REMOTE', page: 2 })
    );
  });

  it('returns 401 for an unauthenticated request', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(req(''));
    expect(res.status).toBe(401);
  });

  it('returns 422 for an invalid workMode value', async () => {
    const res = await GET(req('?workMode=NOT_A_MODE'));
    expect(res.status).toBe(422);
  });
});
