import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const checkRateLimitMock = vi.fn();
const isStorageConfiguredMock = vi.fn();
const createUploadUrlMock = vi.fn();

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
    isStorageConfigured: () => isStorageConfiguredMock(),
    createUploadUrl: (...args: unknown[]) => createUploadUrlMock(...args),
  };
});

// authz.ts (imported via vi.importActual above) unconditionally imports
// @/lib/db at module load — this route doesn't touch the database itself,
// but db.ts's real PrismaClient instantiation still runs unless mocked.
vi.mock('@/lib/db', () => ({ db: {} }));

import { POST } from './route';
import { UnauthorizedError } from '@/lib/authz';

function req(body: unknown) {
  return new Request('https://x.test/x', { method: 'POST', body: JSON.stringify(body) });
}

const validBody = { fileName: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 1024 };

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  checkRateLimitMock.mockReset();
  isStorageConfiguredMock.mockReset();
  createUploadUrlMock.mockReset();

  checkRateLimitMock.mockResolvedValue({ allowed: true });
  isStorageConfiguredMock.mockReturnValue(true);
  requireCandidateSessionMock.mockResolvedValue({
    session: { user: { id: 'user-1', userType: 'CANDIDATE' } },
    profile: { id: 'profile-1' },
  });
  createUploadUrlMock.mockResolvedValue({ url: 'https://s3.example/put', key: 'candidates/user-1/resume.pdf' });
});

describe('POST /api/candidate/profile/resume/upload-url', () => {
  it('issues an upload URL scoped by userId for a valid PDF', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect(createUploadUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'candidates/user-1/resume.pdf' })
    );
  });

  it('rejects a disallowed file type', async () => {
    const res = await POST(req({ ...validBody, fileName: 'resume.exe', mimeType: 'application/x-msdownload' }));
    expect(res.status).toBe(415);
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized file', async () => {
    const res = await POST(req({ ...validBody, sizeBytes: 20 * 1024 * 1024 }));
    expect(res.status).toBe(413);
  });

  it('returns 501 when storage is not configured', async () => {
    isStorageConfiguredMock.mockReturnValue(false);
    const res = await POST(req(validBody));
    expect(res.status).toBe(501);
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false });
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
  });
});
