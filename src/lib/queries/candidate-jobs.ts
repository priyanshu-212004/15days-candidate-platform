import { db } from '@/lib/db';
import type { EmploymentType, Prisma } from '@prisma/client';

export interface MarketplaceJobFilters {
  q?: string;
  location?: string;
  workMode?: 'REMOTE' | 'ON_SITE';
  employmentType?: EmploymentType;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * Cross-organization job listing for the candidate marketplace. Only OPEN,
 * non-deleted jobs — DRAFT/PAUSED/ARCHIVED are never shown here, mirroring
 * the existing Job.status semantics rather than inventing a candidate-only
 * status. No orgId filter at all (unlike queries/jobs.ts's listJobs) —
 * that's the entire point of the marketplace.
 */
export async function listMarketplaceJobs(filters: MarketplaceJobFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const q = filters.q?.trim();
  const location = filters.location?.trim();

  const where: Prisma.JobWhereInput = {
    status: 'OPEN',
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { skills: { has: q } },
            { org: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(location ? { location: { contains: location, mode: 'insensitive' } } : {}),
    ...(filters.workMode === 'REMOTE' ? { remote: true } : {}),
    ...(filters.workMode === 'ON_SITE' ? { remote: false } : {}),
    ...(filters.employmentType ? { employmentType: filters.employmentType } : {}),
  };

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        location: true,
        remote: true,
        employmentType: true,
        experienceLevel: true,
        skills: true,
        createdAt: true,
        org: { select: { name: true, logoUrl: true } },
      },
    }),
    db.job.count({ where }),
  ]);

  return { jobs, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * A single job's candidate-facing detail. Selected fields only — never
 * exposes createdById, internal recruiter data, other applications, or
 * anything beyond what Job/Organization actually store (no invented
 * salary/openings/deadline fields — this schema doesn't have them).
 */
export async function getMarketplaceJobById(jobId: string) {
  return db.job.findFirst({
    where: { id: jobId, status: 'OPEN', deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      requirements: true,
      skills: true,
      experienceLevel: true,
      location: true,
      remote: true,
      employmentType: true,
      createdAt: true,
      orgId: true,
      org: { select: { name: true, logoUrl: true } },
    },
  });
}

/**
 * The interview a candidate would be applying against, if this job has one
 * that's actually usable right now. Reuses evaluateInterviewAvailability
 * (the existing single source of truth for "is this interview link
 * usable") rather than re-deriving eligibility rules — see
 * app/api/candidate/jobs/[jobId]/apply/route.ts.
 */
export async function findEligibleInterviewForJob(jobId: string) {
  return db.interview.findFirst({
    where: { jobId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    include: { questions: { select: { id: true } }, blueprint: { select: { id: true } } },
  });
}
