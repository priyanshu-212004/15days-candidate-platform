import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveCandidateSessionMock = vi.fn();
const turnFindFirstMock = vi.fn();
const isStorageConfiguredMock = vi.fn();
const createUploadUrlMock = vi.fn();

vi.mock('@/lib/queries/candidate-session', () => ({
  resolveCandidateSession: (...args: unknown[]) => resolveCandidateSessionMock(...args),
}));

vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
  return {
    ...actual,
    isStorageConfigured: (...args: unknown[]) => isStorageConfiguredMock(...args),
    createUploadUrl: (...args: unknown[]) => createUploadUrlMock(...args),
  };
});

vi.mock('@/lib/db', () => ({
  db: { interviewTurn: { findFirst: (...args: unknown[]) => turnFindFirstMock(...args) } },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSec: 0, limit: 30 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

import { POST } from './route';

const adaptiveApplication = {
  id: 'app-1',
  orgId: 'org-1',
  status: 'IN_PROGRESS',
  interview: { id: 'interview-1', interviewType: 'ADAPTIVE_VOICE' },
};

function makeRequest(body: unknown) {
  return new Request('https://example.test/api/public/interviews/tok/adaptive/recordings/turn-1/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  turnFindFirstMock.mockReset();
  isStorageConfiguredMock.mockReset();
  createUploadUrlMock.mockReset();

  resolveCandidateSessionMock.mockResolvedValue(adaptiveApplication);
  isStorageConfiguredMock.mockReturnValue(true);
  turnFindFirstMock.mockResolvedValue({ id: 'turn-1' });
});

const validBody = { mimeType: 'video/webm', sizeBytes: 1_000_000 };

describe('POST /adaptive/recordings/:turnId/upload-url', () => {
  it('returns 501 when object storage is not configured — degrades gracefully, not an error the candidate caused', async () => {
    isStorageConfiguredMock.mockReturnValue(false);
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(501);
  });

  it('rejects when there is no active candidate session', async () => {
    resolveCandidateSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(401);
  });

  it('rejects a STATIC interview — this route is adaptive-only', async () => {
    resolveCandidateSessionMock.mockResolvedValue({
      ...adaptiveApplication,
      interview: { id: 'interview-1', interviewType: 'STATIC' },
    });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(409);
  });

  it('rejects once the session is already submitted', async () => {
    resolveCandidateSessionMock.mockResolvedValue({ ...adaptiveApplication, status: 'EVALUATED' });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(409);
  });

  it('rejects a turn that does not belong to this candidate\'s own session', async () => {
    turnFindFirstMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'someone-elses-turn' } });
    expect(res.status).toBe(404);
  });

  it('rejects an unsupported MIME type', async () => {
    const res = await POST(makeRequest({ mimeType: 'video/quicktime', sizeBytes: 1000 }), {
      params: { token: 'tok', turnId: 'turn-1' },
    });
    expect(res.status).toBe(415);
  });

  it('rejects a recording over the size limit', async () => {
    const res = await POST(makeRequest({ mimeType: 'video/webm', sizeBytes: 300 * 1024 * 1024 }), {
      params: { token: 'tok', turnId: 'turn-1' },
    });
    expect(res.status).toBe(413);
  });

  it('issues a presigned upload URL for a valid request', async () => {
    createUploadUrlMock.mockResolvedValue({ url: 'https://signed.example/put', key: 'recordings/org-1/app-1/turn-1.webm', expiresInSec: 900 });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.url).toBe('https://signed.example/put');
    expect(createUploadUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'video/webm', maxBytes: validBody.sizeBytes })
    );
  });
});
