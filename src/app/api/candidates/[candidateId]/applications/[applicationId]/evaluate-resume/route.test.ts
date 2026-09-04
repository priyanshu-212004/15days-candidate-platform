import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireOrgMemberMock = vi.fn();
const applicationFindUniqueMock = vi.fn();
const resumeEvaluationUpsertMock = vi.fn();
const writeAuditLogMock = vi.fn();
const evaluateResumeMock = vi.fn();

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
    application: { findUnique: (...args: unknown[]) => applicationFindUniqueMock(...args) },
    resumeEvaluation: { upsert: (...args: unknown[]) => resumeEvaluationUpsertMock(...args) },
  },
}));

vi.mock('@/lib/ai-evaluation', () => ({
  evaluateResume: (...args: unknown[]) => evaluateResumeMock(...args),
}));

import { POST } from './route';
import { AiConfigError } from '@/lib/ai-provider';

const params = { params: { candidateId: 'cand-1', applicationId: 'app-1' } };

const baseApplication = {
  id: 'app-1',
  orgId: 'org-1',
  candidateId: 'cand-1',
  candidate: { id: 'cand-1', name: 'Amara Chen' },
  job: { title: 'Backend Engineer', description: 'desc', requirements: [], skills: [], experienceLevel: null },
  resume: { id: 'resume-1', parseStatus: 'COMPLETED', parsedText: 'resume text', parseError: null },
};

beforeEach(() => {
  requireOrgMemberMock.mockReset();
  applicationFindUniqueMock.mockReset();
  resumeEvaluationUpsertMock.mockReset();
  writeAuditLogMock.mockReset();
  evaluateResumeMock.mockReset();

  requireOrgMemberMock.mockResolvedValue({ orgId: 'org-1', session: { user: { id: 'user-1' } } });
});

describe('POST evaluate-resume', () => {
  it('returns 404 when the application belongs to a different organization', async () => {
    applicationFindUniqueMock.mockResolvedValue({ ...baseApplication, orgId: 'org-2' });
    const res = await POST(new Request('https://x.test'), params);
    expect(res.status).toBe(403);
  });

  it('returns 404 when the application does not belong to the given candidate', async () => {
    applicationFindUniqueMock.mockResolvedValue({ ...baseApplication, candidateId: 'someone-else' });
    const res = await POST(new Request('https://x.test'), params);
    expect(res.status).toBe(404);
  });

  it('returns 409 when no resume has been uploaded', async () => {
    applicationFindUniqueMock.mockResolvedValue({ ...baseApplication, resume: null });
    const res = await POST(new Request('https://x.test'), params);
    expect(res.status).toBe(409);
  });

  it('returns 409 when resume extraction has not completed', async () => {
    applicationFindUniqueMock.mockResolvedValue({
      ...baseApplication,
      resume: { id: 'resume-1', parseStatus: 'FAILED', parsedText: null, parseError: 'Scanned PDF' },
    });
    const res = await POST(new Request('https://x.test'), params);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/Scanned PDF/);
  });

  it('returns 503 when the AI provider is not configured', async () => {
    applicationFindUniqueMock.mockResolvedValue(baseApplication);
    evaluateResumeMock.mockRejectedValue(new AiConfigError());
    const res = await POST(new Request('https://x.test'), params);
    expect(res.status).toBe(503);
  });

  it('persists a resume evaluation on success', async () => {
    applicationFindUniqueMock.mockResolvedValue(baseApplication);
    evaluateResumeMock.mockResolvedValue({
      overallScore: 8,
      skillsMatchScore: 8,
      experienceMatchScore: 7,
      relevanceScore: 8,
      strengths: ['Good fit'],
      missingSkills: [],
      concerns: [],
      recommendation: 'Advance',
      summary: 'Good candidate',
    });
    resumeEvaluationUpsertMock.mockResolvedValue({ id: 'eval-1', overallScore: 8 });

    const res = await POST(new Request('https://x.test'), params);
    expect(res.status).toBe(200);
    expect(resumeEvaluationUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { resumeId: 'resume-1' } })
    );
    expect(writeAuditLogMock).toHaveBeenCalled();
  });
});
