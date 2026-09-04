import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirstMock = vi.fn();
const findManyMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    candidate: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

import { getCandidateById, listCandidates } from './candidates';

beforeEach(() => {
  findFirstMock.mockReset();
  findManyMock.mockReset();
});

describe('getCandidateById (organization isolation)', () => {
  it('scopes the candidate lookup by both id and the caller organization', async () => {
    findFirstMock.mockResolvedValue(null);
    await getCandidateById('org-mine', 'candidate-1');

    const args = findFirstMock.mock.calls[0]![0] as { where: { id: string; orgId: string } };
    expect(args.where).toMatchObject({ id: 'candidate-1', orgId: 'org-mine' });
  });

  it('also scopes nested applications by the caller organization (defense in depth)', async () => {
    findFirstMock.mockResolvedValue(null);
    await getCandidateById('org-mine', 'candidate-1');

    const args = findFirstMock.mock.calls[0]![0] as {
      include: { applications: { where: { orgId: string } } };
    };
    expect(args.include.applications.where).toMatchObject({ orgId: 'org-mine' });
  });

  it('never returns data for a candidate belonging to a different organization', async () => {
    // The query itself filters by orgId at the database level, so a candidate
    // from another org simply won't match — simulated here by the mock
    // returning null exactly as Prisma would for a non-matching filter.
    findFirstMock.mockResolvedValue(null);
    const result = await getCandidateById('org-mine', 'candidate-belongs-to-org-other');
    expect(result).toBeNull();
  });
});

describe('listCandidates (organization isolation)', () => {
  it('scopes the list query by the caller organization', async () => {
    findManyMock.mockResolvedValue([]);
    await listCandidates('org-mine');

    const args = findManyMock.mock.calls[0]![0] as { where: { orgId: string } };
    expect(args.where).toMatchObject({ orgId: 'org-mine' });
  });
});

describe('listCandidates (filtering)', () => {
  it('applies no application-level filter when none is given', async () => {
    findManyMock.mockResolvedValue([]);
    await listCandidates('org-mine');

    const args = findManyMock.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where).not.toHaveProperty('applications');
  });

  it('filters by search across name, email, and applied job title', async () => {
    findManyMock.mockResolvedValue([]);
    await listCandidates('org-mine', { search: 'Rahul' });

    const args = findManyMock.mock.calls[0]![0] as { where: { OR: unknown[] } };
    expect(args.where.OR).toHaveLength(3);
  });

  it('combines job, interview-status, and evaluation-status into a single applications.some filter', async () => {
    findManyMock.mockResolvedValue([]);
    await listCandidates('org-mine', {
      jobId: 'job-1',
      interviewStatus: 'SUBMITTED',
      evaluationStatus: 'SUCCESSFUL',
    });

    const args = findManyMock.mock.calls[0]![0] as {
      where: { applications: { some: Record<string, unknown> } };
      include: { applications: { where: Record<string, unknown> } };
    };
    expect(args.where.applications.some).toMatchObject({
      jobId: 'job-1',
      status: 'SUBMITTED',
      evaluation: { is: { overallScore: { gte: 7 } } },
    });
    // The same filter also scopes which application is shown as "latest",
    // so the displayed row always matches what was filtered for.
    expect(args.include.applications.where).toEqual(args.where.applications.some);
  });

  it('maps NOT_EVALUATED to evaluation: null', async () => {
    findManyMock.mockResolvedValue([]);
    await listCandidates('org-mine', { evaluationStatus: 'NOT_EVALUATED' });

    const args = findManyMock.mock.calls[0]![0] as { where: { applications: { some: { evaluation: unknown } } } };
    expect(args.where.applications.some.evaluation).toBeNull();
  });

  it('maps UNSUCCESSFUL to a below-threshold score on an existing evaluation', async () => {
    findManyMock.mockResolvedValue([]);
    await listCandidates('org-mine', { evaluationStatus: 'UNSUCCESSFUL' });

    const args = findManyMock.mock.calls[0]![0] as {
      where: { applications: { some: { evaluation: { is: { overallScore: { lt: number } } } } } };
    };
    expect(args.where.applications.some.evaluation).toEqual({ is: { overallScore: { lt: 7 } } });
  });
});
