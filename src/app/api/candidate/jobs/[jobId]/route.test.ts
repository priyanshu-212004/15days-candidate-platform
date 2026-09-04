import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const getMarketplaceJobByIdMock = vi.fn();
const findEligibleInterviewForJobMock = vi.fn();
const candidateFindFirstMock = vi.fn();
const applicationFindFirstMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});
vi.mock('@/lib/queries/candidate-jobs', () => ({
  getMarketplaceJobById: (...args: unknown[]) => getMarketplaceJobByIdMock(...args),
  findEligibleInterviewForJob: (...args: unknown[]) => findEligibleInterviewForJobMock(...args),
}));
vi.mock('@/lib/db', () => ({
  db: {
    candidate: { findFirst: (...args: unknown[]) => candidateFindFirstMock(...args) },
    application: { findFirst: (...args: unknown[]) => applicationFindFirstMock(...args) },
  },
}));

import { GET } from './route';

const job = { id: 'job-1', orgId: 'org-1', title: 'Engineer' };
const activeInterview = {
  id: 'iv-1',
  status: 'ACTIVE',
  expiresAt: null,
  interviewType: 'STATIC',
  questions: [{ id: 'q1' }],
  blueprint: null,
};

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  getMarketplaceJobByIdMock.mockReset();
  findEligibleInterviewForJobMock.mockReset();
  candidateFindFirstMock.mockReset();
  applicationFindFirstMock.mockReset();

  requireCandidateSessionMock.mockResolvedValue({ session: { user: { id: 'user-1', userType: 'CANDIDATE' } } });
  getMarketplaceJobByIdMock.mockResolvedValue(job);
  findEligibleInterviewForJobMock.mockResolvedValue(activeInterview);
  candidateFindFirstMock.mockResolvedValue(null);
  applicationFindFirstMock.mockResolvedValue(null);
});

describe('GET /api/candidate/jobs/[jobId]', () => {
  it('returns 404 for a job that does not exist / is not open', async () => {
    getMarketplaceJobByIdMock.mockResolvedValue(null);
    const res = await GET(new Request('https://x.test/x'), { params: { jobId: 'nope' } });
    expect(res.status).toBe(404);
  });

  it('canApply is true when eligible and not yet applied', async () => {
    const res = await GET(new Request('https://x.test/x'), { params: { jobId: 'job-1' } });
    const data = await res.json();
    expect(data.canApply).toBe(true);
    expect(data.alreadyApplied).toBe(false);
  });

  it('alreadyApplied is true and canApply is false when an application already exists', async () => {
    candidateFindFirstMock.mockResolvedValue({ id: 'cand-1' });
    applicationFindFirstMock.mockResolvedValue({ id: 'app-1' });

    const res = await GET(new Request('https://x.test/x'), { params: { jobId: 'job-1' } });
    const data = await res.json();

    expect(data.alreadyApplied).toBe(true);
    expect(data.canApply).toBe(false);
    expect(data.applicationId).toBe('app-1');
  });

  it('canApply is false when the job has no eligible interview', async () => {
    findEligibleInterviewForJobMock.mockResolvedValue(null);
    const res = await GET(new Request('https://x.test/x'), { params: { jobId: 'job-1' } });
    const data = await res.json();
    expect(data.canApply).toBe(false);
  });
});
