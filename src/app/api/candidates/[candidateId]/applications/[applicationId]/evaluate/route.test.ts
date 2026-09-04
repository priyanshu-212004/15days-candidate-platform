import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireOrgMemberMock = vi.fn();
const applicationFindUniqueMock = vi.fn();
const evaluationUpsertMock = vi.fn();
const applicationUpdateMock = vi.fn();
const writeAuditLogMock = vi.fn();
const evaluateApplicationMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return {
    ...actual,
    requireOrgMember: (...args: unknown[]) => requireOrgMemberMock(...args),
    writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    application: {
      findUnique: (...args: unknown[]) => applicationFindUniqueMock(...args),
      update: (...args: unknown[]) => applicationUpdateMock(...args),
    },
    evaluation: { upsert: (...args: unknown[]) => evaluationUpsertMock(...args) },
  },
}));

vi.mock('@/lib/ai-evaluation', () => ({
  evaluateApplication: (...args: unknown[]) => evaluateApplicationMock(...args),
}));

import { POST } from './route';

const params = { params: { candidateId: 'cand-1', applicationId: 'app-1' } };

const question1 = { id: 'q-1', text: 'Tell me about a challenge you solved.', order: 0 };
const question2 = { id: 'q-2', text: 'Which databases have you used?', order: 1 };

function baseApplication(videoResponses: unknown[]) {
  return {
    id: 'app-1',
    orgId: 'org-1',
    candidateId: 'cand-1',
    status: 'SUBMITTED',
    candidate: { id: 'cand-1', name: 'Amara Chen' },
    job: { title: 'Backend Engineer' },
    interview: { questions: [question1, question2] },
    videoResponses,
    evaluation: null,
  };
}

beforeEach(() => {
  requireOrgMemberMock.mockReset();
  applicationFindUniqueMock.mockReset();
  evaluationUpsertMock.mockReset();
  applicationUpdateMock.mockReset();
  writeAuditLogMock.mockReset();
  evaluateApplicationMock.mockReset();

  requireOrgMemberMock.mockResolvedValue({ orgId: 'org-1', session: { user: { id: 'user-1' } } });
  evaluationUpsertMock.mockResolvedValue({ id: 'eval-1', overallScore: 7 });
  applicationUpdateMock.mockResolvedValue({});
});

describe('POST evaluate — transcript handling', () => {
  it('passes a completed transcript through to the evaluation call as answer content', async () => {
    applicationFindUniqueMock.mockResolvedValue(
      baseApplication([
        { questionId: 'q-1', answerText: null, storageKey: 'recordings/org-1/app-1/q-1.webm', transcript: 'My answer about the challenge.' },
        { questionId: 'q-2', answerText: 'Postgres and Redis.', storageKey: null, transcript: null },
      ])
    );
    evaluateApplicationMock.mockResolvedValue({
      overallScore: 7,
      summary: 'Solid',
      strengths: [],
      concerns: [],
      scores: [{ category: 'TECHNICAL', score: 7 }],
    });

    await POST(new Request('https://x.test'), params);

    expect(evaluateApplicationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [
          expect.objectContaining({ answerText: 'My answer about the challenge.', hasRecordingWithoutTranscript: false }),
          expect.objectContaining({ answerText: 'Postgres and Redis.', hasRecordingWithoutTranscript: false }),
        ],
      })
    );
  });

  it('flags a video answer with no transcript yet rather than fabricating content for it', async () => {
    applicationFindUniqueMock.mockResolvedValue(
      baseApplication([
        { questionId: 'q-1', answerText: null, storageKey: 'recordings/org-1/app-1/q-1.webm', transcript: null },
        { questionId: 'q-2', answerText: 'Postgres and Redis.', storageKey: null, transcript: null },
      ])
    );
    evaluateApplicationMock.mockResolvedValue({
      overallScore: 5,
      summary: 'Partial',
      strengths: [],
      concerns: [],
      scores: [{ category: 'TECHNICAL', score: 5 }],
    });

    await POST(new Request('https://x.test'), params);

    expect(evaluateApplicationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [
          expect.objectContaining({ answerText: null, hasRecordingWithoutTranscript: true }),
          expect.objectContaining({ answerText: 'Postgres and Redis.', hasRecordingWithoutTranscript: false }),
        ],
      })
    );
  });

  it('does not persist an evaluation when the AI call itself fails (never silently scored on failure)', async () => {
    applicationFindUniqueMock.mockResolvedValue(
      baseApplication([{ questionId: 'q-1', answerText: null, storageKey: 'recordings/org-1/app-1/q-1.webm', transcript: null }])
    );
    evaluateApplicationMock.mockRejectedValue(new Error('unexpected'));

    await expect(POST(new Request('https://x.test'), params)).resolves.toBeDefined();
    expect(evaluationUpsertMock).not.toHaveBeenCalled();
  });
});
