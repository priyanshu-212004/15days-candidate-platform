import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveCandidateSessionMock = vi.fn();
const isStorageConfiguredMock = vi.fn();
const createUploadUrlMock = vi.fn();

vi.mock('@/lib/queries/candidate-session', () => ({
  resolveCandidateSession: (...args: unknown[]) => resolveCandidateSessionMock(...args),
}));

vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
  return {
    ...actual,
    isStorageConfigured: () => isStorageConfiguredMock(),
    createUploadUrl: (...args: unknown[]) => createUploadUrlMock(...args),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSec: 0, limit: 20 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new Request('https://example.test/api/public/interviews/tok/resume/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const openApplication = { id: 'app-1', orgId: 'org-1', status: 'IN_PROGRESS' };

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  isStorageConfiguredMock.mockReset();
  createUploadUrlMock.mockReset();
  isStorageConfiguredMock.mockReturnValue(true);
  createUploadUrlMock.mockResolvedValue({ url: 'https://s3.example/put', key: 'resumes/org-1/app-1.pdf', expiresInSec: 900 });
});

describe('POST /resume/upload-url', () => {
  it('rejects when there is no active candidate session', async () => {
    resolveCandidateSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ fileName: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 1000 }), {
      params: { token: 'tok' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects once the interview has already been submitted', async () => {
    resolveCandidateSessionMock.mockResolvedValue({ ...openApplication, status: 'SUBMITTED' });
    const res = await POST(makeRequest({ fileName: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 1000 }), {
      params: { token: 'tok' },
    });
    expect(res.status).toBe(409);
  });

  it('rejects an unsupported file type', async () => {
    resolveCandidateSessionMock.mockResolvedValue(openApplication);
    const res = await POST(makeRequest({ fileName: 'r.png', mimeType: 'image/png', sizeBytes: 1000 }), {
      params: { token: 'tok' },
    });
    expect(res.status).toBe(415);
  });

  it('rejects a MIME/extension mismatch (spoofed content-type)', async () => {
    resolveCandidateSessionMock.mockResolvedValue(openApplication);
    const res = await POST(makeRequest({ fileName: 'r.exe', mimeType: 'application/pdf', sizeBytes: 1000 }), {
      params: { token: 'tok' },
    });
    expect(res.status).toBe(415);
  });

  it('rejects a file over the size limit', async () => {
    resolveCandidateSessionMock.mockResolvedValue(openApplication);
    const res = await POST(
      makeRequest({ fileName: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 11 * 1024 * 1024 }),
      { params: { token: 'tok' } }
    );
    expect(res.status).toBe(413);
  });

  it('returns a presigned upload URL for a valid PDF request', async () => {
    resolveCandidateSessionMock.mockResolvedValue(openApplication);
    const res = await POST(makeRequest({ fileName: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 50_000 }), {
      params: { token: 'tok' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toBe('https://s3.example/put');
    expect(createUploadUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining('org-1') })
    );
  });

  it('returns 501 when storage is not configured', async () => {
    isStorageConfiguredMock.mockReturnValue(false);
    resolveCandidateSessionMock.mockResolvedValue(openApplication);
    const res = await POST(makeRequest({ fileName: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 50_000 }), {
      params: { token: 'tok' },
    });
    expect(res.status).toBe(501);
  });
});
