import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveCandidateSessionMock = vi.fn();
const headObjectMock = vi.fn();
const getObjectBufferMock = vi.fn();
const extractResumeTextMock = vi.fn();
const resumeFindUniqueMock = vi.fn();
const resumeUpsertMock = vi.fn();
const resumeUpdateMock = vi.fn();
const resumeEvaluationDeleteManyMock = vi.fn();

vi.mock('@/lib/queries/candidate-session', () => ({
  resolveCandidateSession: (...args: unknown[]) => resolveCandidateSessionMock(...args),
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
  db: {
    resume: {
      findUnique: (...args: unknown[]) => resumeFindUniqueMock(...args),
      upsert: (...args: unknown[]) => resumeUpsertMock(...args),
      update: (...args: unknown[]) => resumeUpdateMock(...args),
    },
    resumeEvaluation: {
      deleteMany: (...args: unknown[]) => resumeEvaluationDeleteManyMock(...args),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSec: 0, limit: 20 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

import { POST } from './route';

const openApplication = { id: 'app-1', orgId: 'org-1', status: 'IN_PROGRESS' };
const VALID_KEY = 'org-1/app-1.pdf';

function makeRequest(body: unknown) {
  return new Request('https://example.test/api/public/interviews/tok/resume/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  headObjectMock.mockReset();
  getObjectBufferMock.mockReset();
  extractResumeTextMock.mockReset();
  resumeFindUniqueMock.mockReset();
  resumeUpsertMock.mockReset();
  resumeUpdateMock.mockReset();
  resumeEvaluationDeleteManyMock.mockReset();

  resolveCandidateSessionMock.mockResolvedValue(openApplication);
  headObjectMock.mockResolvedValue({ exists: true, sizeBytes: 50_000 });
  getObjectBufferMock.mockResolvedValue(Buffer.from('fake pdf bytes'));
  extractResumeTextMock.mockResolvedValue({ status: 'COMPLETED', text: 'Extracted resume text.' });
  resumeFindUniqueMock.mockResolvedValue(null);
  resumeUpsertMock.mockResolvedValue({ id: 'resume-1', fileName: 'resume.pdf' });
  resumeUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'resume-1',
    fileName: 'resume.pdf',
    ...data,
  }));
});

const validBody = { storageKey: VALID_KEY, fileName: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 50_000 };

describe('POST /resume/complete', () => {
  it('rejects when there is no active candidate session', async () => {
    resolveCandidateSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(res.status).toBe(401);
  });

  it('rejects a storage key that does not belong to this application (defense in depth)', async () => {
    const res = await POST(
      makeRequest({ ...validBody, storageKey: 'some-other-org/some-other-app.pdf' }),
      { params: { token: 'tok' } }
    );
    expect(res.status).toBe(403);
  });

  it('rejects when the object was never actually uploaded', async () => {
    headObjectMock.mockResolvedValue({ exists: false });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(res.status).toBe(422);
  });

  it('rejects an unsupported MIME/extension combination', async () => {
    const res = await POST(makeRequest({ ...validBody, mimeType: 'image/png', fileName: 'resume.png' }), {
      params: { token: 'tok' },
    });
    expect(res.status).toBe(415);
  });

  it('stores COMPLETED status and parsed text on successful extraction', async () => {
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resume.parseStatus).toBe('COMPLETED');
    expect(resumeUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parseStatus: 'COMPLETED', parsedText: 'Extracted resume text.' }),
      })
    );
  });

  it('stores FAILED status with a real error and never fabricates parsed text', async () => {
    extractResumeTextMock.mockResolvedValue({ status: 'FAILED', error: 'Scanned PDF, no extractable text.' });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resume.parseStatus).toBe('FAILED');
    expect(data.resume.parseError).toBe('Scanned PDF, no extractable text.');
    expect(resumeUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parseStatus: 'FAILED' }) })
    );
    const updateCall = resumeUpdateMock.mock.calls.find((c: unknown[]) => 'parsedText' in ((c[0] as { data?: object })?.data ?? {}));
    expect(updateCall).toBeUndefined();
  });

  it('clears any prior resume evaluation when a new file is uploaded over an existing resume', async () => {
    resumeFindUniqueMock.mockResolvedValue({ id: 'resume-1' });
    await POST(makeRequest(validBody), { params: { token: 'tok' } });
    expect(resumeEvaluationDeleteManyMock).toHaveBeenCalledWith({ where: { resumeId: 'resume-1' } });
  });
});
