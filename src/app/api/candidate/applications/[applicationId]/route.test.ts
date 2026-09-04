import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});
vi.mock('@/lib/db', () => ({ db: { application: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } } }));

import { GET } from './route';

const params = { params: { applicationId: 'app-1' } };

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  findUniqueMock.mockReset();
  requireCandidateSessionMock.mockResolvedValue({ session: { user: { id: 'candidate-a', userType: 'CANDIDATE' } } });
});

describe('GET /api/candidate/applications/[applicationId]', () => {
  it("returns the application when it belongs to the caller", async () => {
    findUniqueMock.mockResolvedValue({
      id: 'app-1',
      status: 'PENDING',
      candidate: { userId: 'candidate-a' },
      job: { title: 'Engineer' },
    });

    const res = await GET(new Request('https://x.test/x'), params);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.application.id).toBe('app-1');
    // candidate.userId must never leak into the response
    expect(data.application.candidate).toBeUndefined();
  });

  it("returns 404 (not the application) for another candidate's applicationId — the IDOR case", async () => {
    findUniqueMock.mockResolvedValue({
      id: 'app-1',
      status: 'PENDING',
      candidate: { userId: 'candidate-b' }, // belongs to someone else
      job: { title: 'Engineer' },
    });

    const res = await GET(new Request('https://x.test/x'), params);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.application).toBeUndefined();
  });

  it('returns 404 for a nonexistent application', async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await GET(new Request('https://x.test/x'), params);
    expect(res.status).toBe(404);
  });
});
