import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyMock = vi.fn();
const countMock = vi.fn();
const jobFindFirstMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    job: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
      findFirst: (...args: unknown[]) => jobFindFirstMock(...args),
    },
    interview: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
  },
}));

import { listMarketplaceJobs, getMarketplaceJobById, findEligibleInterviewForJob } from './candidate-jobs';

beforeEach(() => {
  findManyMock.mockReset();
  countMock.mockReset();
  jobFindFirstMock.mockReset();
  findFirstMock.mockReset();
  findManyMock.mockResolvedValue([]);
  countMock.mockResolvedValue(0);
  jobFindFirstMock.mockResolvedValue(null);
});

describe('listMarketplaceJobs', () => {
  it('only ever queries OPEN, non-deleted jobs, with no orgId filter', async () => {
    await listMarketplaceJobs({});
    const where = findManyMock.mock.calls[0]![0].where;
    expect(where.status).toBe('OPEN');
    expect(where.deletedAt).toBeNull();
    expect(where.orgId).toBeUndefined();
  });

  it('applies workMode REMOTE as remote:true', async () => {
    await listMarketplaceJobs({ workMode: 'REMOTE' });
    expect(findManyMock.mock.calls[0]![0].where.remote).toBe(true);
  });

  it('applies workMode ON_SITE as remote:false', async () => {
    await listMarketplaceJobs({ workMode: 'ON_SITE' });
    expect(findManyMock.mock.calls[0]![0].where.remote).toBe(false);
  });

  it('paginates and caps page size', async () => {
    await listMarketplaceJobs({ page: 3, pageSize: 999 });
    const call = findManyMock.mock.calls[0]![0];
    expect(call.take).toBe(50); // capped at MAX_PAGE_SIZE
    expect(call.skip).toBe(2 * 50);
  });
});

describe('getMarketplaceJobById', () => {
  it('scopes to OPEN, non-deleted jobs only', async () => {
    await getMarketplaceJobById('job-1');
    expect(jobFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-1', status: 'OPEN', deletedAt: null } })
    );
  });
});

describe('findEligibleInterviewForJob', () => {
  it('only looks for ACTIVE interviews for the given job', async () => {
    await findEligibleInterviewForJob('job-1');
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: 'job-1', status: 'ACTIVE' } })
    );
  });
});
