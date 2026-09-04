import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const checkRateLimitMock = vi.fn();
const headObjectMock = vi.fn();
const getObjectBufferMock = vi.fn();
const candidateProfileUpdateMock = vi.fn();
const extractResumeTextMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
  return {
    ...actual,
    headObject: (...args: unknown[]) => headObjectMock(...args),
    getObjectBuffer: (...args: unknown[]) => getObjectBufferMock(...args),
  };
});

vi.mock('@/lib/resume-extraction', () => ({
  extractResumeText: (...args: unknown[]) => extractResumeTextMock(...args),
}));

vi.mock('@/lib/db', () => ({
  db: { candidateProfile: { update: (...args: unknown[]) => candidateProfileUpdateMock(...args) } },
}));

import { POST } from './route';

function req(body: unknown) {
  return new Request('https://x.test/x', { method: 'POST', body: JSON.stringify(body) });
}

const validBody = {
  storageKey: 'candidates/user-1/resume.pdf',
  fileName: 'resume.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
};

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  checkRateLimitMock.mockReset();
  headObjectMock.mockReset();
  getObjectBufferMock.mockReset();
  candidateProfileUpdateMock.mockReset();
  extractResumeTextMock.mockReset();

  checkRateLimitMock.mockResolvedValue({ allowed: true });
  requireCandidateSessionMock.mockResolvedValue({
    session: { user: { id: 'user-1', userType: 'CANDIDATE' } },
    profile: { id: 'profile-1' },
  });
  headObjectMock.mockResolvedValue({ exists: true, sizeBytes: 1024 });
  getObjectBufferMock.mockResolvedValue(Buffer.from('resume bytes'));
  extractResumeTextMock.mockResolvedValue({ status: 'COMPLETED', text: 'parsed text' });
  candidateProfileUpdateMock.mockImplementation(({ data }) => Promise.resolve({ id: 'profile-1', ...data }));
});

describe('POST /api/candidate/profile/resume/complete', () => {
  it('stores parsed resume metadata on CandidateProfile for a valid, matching upload', async () => {
    const res = await POST(req(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.resume.parseStatus).toBe('COMPLETED');
    expect(candidateProfileUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'profile-1' } })
    );
  });

  it("rejects a storageKey that doesn't belong to this candidate — the IDOR case", async () => {
    const res = await POST(req({ ...validBody, storageKey: 'candidates/someone-else/resume.pdf' }));
    expect(res.status).toBe(403);
    expect(headObjectMock).not.toHaveBeenCalled();
    expect(candidateProfileUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects when the upload cannot be verified via headObject', async () => {
    headObjectMock.mockResolvedValue({ exists: false });
    const res = await POST(req(validBody));
    expect(res.status).toBe(422);
    expect(candidateProfileUpdateMock).not.toHaveBeenCalled();
  });

  it('records a FAILED parse status without throwing when extraction fails', async () => {
    extractResumeTextMock.mockResolvedValue({ status: 'FAILED', error: 'No extractable text found.' });
    const res = await POST(req(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.resume.parseStatus).toBe('FAILED');
  });

  it('rejects a disallowed mime type', async () => {
    const res = await POST(
      req({ ...validBody, mimeType: 'application/x-msdownload', storageKey: 'candidates/user-1/resume.exe' })
    );
    expect(res.status).toBe(415);
  });
});
