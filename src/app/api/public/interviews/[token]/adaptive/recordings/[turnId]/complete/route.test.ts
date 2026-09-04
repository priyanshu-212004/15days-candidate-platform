import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveCandidateSessionMock = vi.fn();
const turnFindFirstMock = vi.fn();
const turnUpdateMock = vi.fn();
const headObjectMock = vi.fn();
const getObjectBufferMock = vi.fn();
const transcribeRecordingMock = vi.fn();

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
    interviewTurn: {
      findFirst: (...args: unknown[]) => turnFindFirstMock(...args),
      update: (...args: unknown[]) => turnUpdateMock(...args),
    },
  },
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

const VALID_KEY = 'recordings/org-1/app-1/turn-1.webm';

function makeRequest(body: unknown) {
  return new Request('https://example.test/api/public/interviews/tok/adaptive/recordings/turn-1/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resolveCandidateSessionMock.mockReset();
  turnFindFirstMock.mockReset();
  turnUpdateMock.mockReset();
  headObjectMock.mockReset();
  getObjectBufferMock.mockReset();
  transcribeRecordingMock.mockReset();

  resolveCandidateSessionMock.mockResolvedValue(adaptiveApplication);
  turnFindFirstMock.mockResolvedValue({ id: 'turn-1' });
  turnUpdateMock.mockResolvedValue({});
  headObjectMock.mockResolvedValue({ exists: true, sizeBytes: 1000 });
  getObjectBufferMock.mockResolvedValue(Buffer.from('fake'));
  transcribeRecordingMock.mockResolvedValue({ status: 'COMPLETED', text: 'transcribed text' });
});

const validBody = { storageKey: VALID_KEY, durationSec: 42 };

describe('POST /adaptive/recordings/:turnId/complete', () => {
  it('rejects when there is no active candidate session', async () => {
    resolveCandidateSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(401);
  });

  it('rejects a STATIC interview', async () => {
    resolveCandidateSessionMock.mockResolvedValue({
      ...adaptiveApplication,
      interview: { id: 'interview-1', interviewType: 'STATIC' },
    });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(409);
  });

  it('rejects a turn that does not belong to this session', async () => {
    turnFindFirstMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(404);
  });

  it('rejects a storage key that does not match this application/turn (defense in depth)', async () => {
    const res = await POST(
      makeRequest({ storageKey: 'recordings/org-1/someone-elses-app/turn-1.webm', durationSec: 10 }),
      { params: { token: 'tok', turnId: 'turn-1' } }
    );
    expect(res.status).toBe(403);
    expect(headObjectMock).not.toHaveBeenCalled();
  });

  it('rejects when the object was not actually confirmed uploaded', async () => {
    headObjectMock.mockResolvedValue({ exists: false });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    expect(res.status).toBe(422);
  });

  it('persists video metadata on the turn BEFORE attempting transcription (upload confirmation is not blocked by transcription)', async () => {
    await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });

    expect(turnUpdateMock).toHaveBeenNthCalledWith(1, {
      where: { id: 'turn-1' },
      data: expect.objectContaining({ videoStorageKey: VALID_KEY, videoDurationSec: 42, videoTranscriptStatus: 'PROCESSING' }),
    });
  });

  it('stores the transcript as a durable backup once transcription succeeds', async () => {
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.videoTranscriptStatus).toBe('COMPLETED');
    expect(turnUpdateMock).toHaveBeenLastCalledWith({
      where: { id: 'turn-1' },
      data: { videoTranscript: 'transcribed text', videoTranscriptStatus: 'COMPLETED' },
    });
  });

  it('marks FAILED (never fabricates a transcript) when transcription errors, but the video is still saved', async () => {
    transcribeRecordingMock.mockResolvedValue({ status: 'FAILED', error: 'boom' });
    const res = await POST(makeRequest(validBody), { params: { token: 'tok', turnId: 'turn-1' } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.videoTranscriptStatus).toBe('FAILED');
    expect(turnUpdateMock).toHaveBeenLastCalledWith({
      where: { id: 'turn-1' },
      data: { videoTranscript: null, videoTranscriptStatus: 'FAILED' },
    });
  });
});
