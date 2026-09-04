import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveCandidateSessionMock = vi.fn();
const headObjectMock = vi.fn();
const getObjectBufferMock = vi.fn();
const transcribeRecordingMock = vi.fn();
const questionFindFirstMock = vi.fn();
const videoResponseUpsertMock = vi.fn();
const videoResponseUpdateMock = vi.fn();

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

vi.mock('@/lib/transcription', async () => {
  const actual = await vi.importActual<typeof import('@/lib/transcription')>('@/lib/transcription');
  return {
    ...actual,
    transcribeRecording: (...args: unknown[]) => transcribeRecordingMock(...args),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    interviewQuestion: { findFirst: (...args: unknown[]) => questionFindFirstMock(...args) },
    videoResponse: {
      upsert: (...args: unknown[]) => videoResponseUpsertMock(...args),
      update: (...args: unknown[]) => videoResponseUpdateMock(...args),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSec: 0, limit: 30 }),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () => new Response('rate limited', { status: 429 }),
}));

import { POST } from './route';

const openApplication = { id: 'app-1', orgId: 'org-1', interviewId: 'iv-1', status: 'IN_PROGRESS' };
const VALID_KEY = 'recordings/org-1/app-1/q-1.webm';

function makeRequest(body: unknown) {
  return new Request('https://example.test/api/public/interviews/tok/recordings/q-1/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  headObjectMock.mockReset();
  getObjectBufferMock.mockReset();
  transcribeRecordingMock.mockReset();
  questionFindFirstMock.mockReset();
  videoResponseUpsertMock.mockReset();
  videoResponseUpdateMock.mockReset();

  resolveCandidateSessionMock.mockResolvedValue(openApplication);
  questionFindFirstMock.mockResolvedValue({ id: 'q-1', answerType: 'VIDEO' });
  headObjectMock.mockResolvedValue({ exists: true, sizeBytes: 1_000_000 });
  getObjectBufferMock.mockResolvedValue(Buffer.from('fake video bytes'));
  videoResponseUpsertMock.mockResolvedValue({ id: 'vr-1', updatedAt: new Date('2026-01-01') });
  videoResponseUpdateMock.mockResolvedValue({});
});

const validBody = { storageKey: VALID_KEY, durationSec: 45 };

describe('POST /recordings/[questionId]/complete — transcription', () => {
  it('stores a completed transcript and COMPLETED status on success', async () => {
    transcribeRecordingMock.mockResolvedValue({ status: 'COMPLETED', text: 'This is my spoken answer.' });

    const res = await POST(makeRequest(validBody), { params: { token: 'tok', questionId: 'q-1' } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transcriptStatus).toBe('COMPLETED');
    expect(videoResponseUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { transcript: 'This is my spoken answer.', transcriptStatus: 'COMPLETED' } })
    );
  });

  it('stores FAILED status with a null transcript on transcription failure — never fabricates text', async () => {
    transcribeRecordingMock.mockResolvedValue({ status: 'FAILED', error: 'Transcription is not configured.' });

    const res = await POST(makeRequest(validBody), { params: { token: 'tok', questionId: 'q-1' } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transcriptStatus).toBe('FAILED');
    expect(videoResponseUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { transcript: null, transcriptStatus: 'FAILED' } })
    );
  });

  it('skips calling the transcription provider entirely for an oversized recording, and marks FAILED', async () => {
    headObjectMock.mockResolvedValue({ exists: true, sizeBytes: 300 * 1024 * 1024 });

    const res = await POST(makeRequest(validBody), { params: { token: 'tok', questionId: 'q-1' } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transcriptStatus).toBe('FAILED');
    expect(getObjectBufferMock).not.toHaveBeenCalled();
    expect(transcribeRecordingMock).not.toHaveBeenCalled();
  });

  it('still saves the recording itself even when transcription fails (upload success is not blocked by transcription)', async () => {
    transcribeRecordingMock.mockResolvedValue({ status: 'FAILED', error: 'boom' });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', questionId: 'q-1' } });
    expect(res.status).toBe(200);
    expect(videoResponseUpsertMock).toHaveBeenCalled();
  });
});
