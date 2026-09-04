import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const getMarketplaceJobByIdMock = vi.fn();
const findEligibleInterviewForJobMock = vi.fn();
const checkRateLimitMock = vi.fn();
const candidateFindUniqueMock = vi.fn();
const candidateUpdateMock = vi.fn();
const candidateCreateMock = vi.fn();
const applicationFindFirstMock = vi.fn();
const applicationCreateMock = vi.fn();
const resumeCreateMock = vi.fn();
const getObjectBufferMock = vi.fn();
const putObjectBufferMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});
vi.mock('@/lib/queries/candidate-jobs', () => ({
  getMarketplaceJobById: (...args: unknown[]) => getMarketplaceJobByIdMock(...args),
  findEligibleInterviewForJob: (...args: unknown[]) => findEligibleInterviewForJobMock(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));
vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
  return {
    ...actual,
    getObjectBuffer: (...args: unknown[]) => getObjectBufferMock(...args),
    putObjectBuffer: (...args: unknown[]) => putObjectBufferMock(...args),
  };
});
vi.mock('@/lib/db', () => ({
  db: {
    candidate: {
      findUnique: (...args: unknown[]) => candidateFindUniqueMock(...args),
      update: (...args: unknown[]) => candidateUpdateMock(...args),
      create: (...args: unknown[]) => candidateCreateMock(...args),
    },
    application: {
      findFirst: (...args: unknown[]) => applicationFindFirstMock(...args),
      create: (...args: unknown[]) => applicationCreateMock(...args),
    },
    resume: { create: (...args: unknown[]) => resumeCreateMock(...args) },
  },
}));

import { POST } from './route';
import { UnauthorizedError } from '@/lib/authz';

const job = { id: 'job-1', orgId: 'org-1', title: 'Engineer' };
const activeInterview = {
  id: 'iv-1',
  status: 'ACTIVE',
  expiresAt: null,
  interviewType: 'STATIC',
  questions: [{ id: 'q1' }],
  blueprint: null,
};
const profile = {
  phone: '555-0100',
  location: 'Remote',
  resumeStorageKey: null,
  resumeFileName: null,
  resumeMimeType: null,
  resumeSizeBytes: null,
  resumeParsedText: null,
  resumeParseStatus: 'PENDING',
  resumeParseError: null,
};

function req(body?: unknown) {
  return new Request('https://x.test/x', { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}
const params = { params: { jobId: 'job-1' } };

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  getMarketplaceJobByIdMock.mockReset();
  findEligibleInterviewForJobMock.mockReset();
  checkRateLimitMock.mockReset();
  candidateFindUniqueMock.mockReset();
  candidateUpdateMock.mockReset();
  candidateCreateMock.mockReset();
  applicationFindFirstMock.mockReset();
  applicationCreateMock.mockReset();
  resumeCreateMock.mockReset();
  getObjectBufferMock.mockReset();
  putObjectBufferMock.mockReset();

  checkRateLimitMock.mockResolvedValue({ allowed: true });
  requireCandidateSessionMock.mockResolvedValue({
    session: { user: { id: 'user-1', email: 'jane@example.com', name: 'Jane Doe', userType: 'CANDIDATE' } },
    profile,
  });
  getMarketplaceJobByIdMock.mockResolvedValue(job);
  findEligibleInterviewForJobMock.mockResolvedValue(activeInterview);
  candidateFindUniqueMock.mockResolvedValue(null); // Case D by default
  candidateCreateMock.mockResolvedValue({ id: 'cand-1' });
  applicationFindFirstMock.mockResolvedValue(null);
  applicationCreateMock.mockResolvedValue({ id: 'app-1', status: 'PENDING' });
});

describe('POST /api/candidate/jobs/[jobId]/apply', () => {
  it('Case D: creates a new org-scoped Candidate when none exists, then the Application', async () => {
    const res = await POST(req(), params);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.application.id).toBe('app-1');
    expect(candidateCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org-1', email: 'jane@example.com', userId: 'user-1' }) })
    );
    expect(applicationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org-1', candidateId: 'cand-1', jobId: 'job-1', interviewId: 'iv-1' }),
      })
    );
  });

  it('Case A: reuses an already-linked Candidate without creating a new one', async () => {
    candidateFindUniqueMock.mockResolvedValue({ id: 'cand-existing', userId: 'user-1' });

    await POST(req(), params);

    expect(candidateCreateMock).not.toHaveBeenCalled();
    expect(candidateUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cand-existing' } }));
    expect(applicationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ candidateId: 'cand-existing' }) })
    );
  });

  it('Case B: links an existing unlinked Candidate to this user', async () => {
    candidateFindUniqueMock.mockResolvedValue({ id: 'cand-unlinked', userId: null });

    await POST(req(), params);

    expect(candidateUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cand-unlinked' }, data: expect.objectContaining({ userId: 'user-1' }) })
    );
    expect(candidateCreateMock).not.toHaveBeenCalled();
  });

  it('Case C: refuses and does NOT overwrite when linked to a different user', async () => {
    candidateFindUniqueMock.mockResolvedValue({ id: 'cand-other', userId: 'someone-else' });

    const res = await POST(req(), params);

    expect(res.status).toBe(409);
    expect(candidateUpdateMock).not.toHaveBeenCalled();
    expect(candidateCreateMock).not.toHaveBeenCalled();
    expect(applicationCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a duplicate application', async () => {
    applicationFindFirstMock.mockResolvedValue({ id: 'existing-app' });

    const res = await POST(req(), params);

    expect(res.status).toBe(409);
    expect(applicationCreateMock).not.toHaveBeenCalled();
  });

  it('rejects when the job has no eligible interview to apply against', async () => {
    findEligibleInterviewForJobMock.mockResolvedValue(null);

    const res = await POST(req(), params);

    expect(res.status).toBe(409);
    expect(applicationCreateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a job that is not open/does not exist', async () => {
    getMarketplaceJobByIdMock.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it("ignores candidateId/organizationId/recruiterId supplied in the request body — ownership comes only from the session and the job", async () => {
    const res = await POST(
      req({ candidateId: 'attacker-candidate', organizationId: 'attacker-org', recruiterId: 'attacker-recruiter' }),
      params
    );

    expect(res.status).toBe(201);
    // The created application uses job.orgId ('org-1') and the
    // session-resolved candidate ('cand-1'), never anything from the body.
    expect(applicationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org-1', candidateId: 'cand-1' }) })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false });
    const res = await POST(req(), params);
    expect(res.status).toBe(429);
  });

  it('attaches a resume snapshot copy (not the live profile key) when the candidate has a resume', async () => {
    requireCandidateSessionMock.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'jane@example.com', name: 'Jane Doe', userType: 'CANDIDATE' } },
      profile: {
        ...profile,
        resumeStorageKey: 'candidates/user-1/resume.pdf',
        resumeFileName: 'resume.pdf',
        resumeMimeType: 'application/pdf',
        resumeSizeBytes: 1024,
        resumeParsedText: 'parsed',
        resumeParseStatus: 'COMPLETED',
      },
    });
    getObjectBufferMock.mockResolvedValue(Buffer.from('pdf bytes'));
    putObjectBufferMock.mockResolvedValue(true);

    await POST(req(), params);

    expect(putObjectBufferMock).toHaveBeenCalled();
    const snapshotKey = putObjectBufferMock.mock.calls[0]?.[0]?.key;
    expect(snapshotKey).not.toBe('candidates/user-1/resume.pdf'); // must be a distinct, immutable key
    expect(resumeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ applicationId: 'app-1', storageKey: snapshotKey }) })
    );
  });

  it('still creates the application successfully when the resume copy fails', async () => {
    requireCandidateSessionMock.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'jane@example.com', name: 'Jane Doe', userType: 'CANDIDATE' } },
      profile: { ...profile, resumeStorageKey: 'candidates/user-1/resume.pdf', resumeMimeType: 'application/pdf' },
    });
    getObjectBufferMock.mockResolvedValue(null); // simulate storage read failure

    const res = await POST(req(), params);

    expect(res.status).toBe(201);
    expect(resumeCreateMock).not.toHaveBeenCalled();
  });
});
