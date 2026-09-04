import { db } from '@/lib/db';

export interface GetPipelineApplicationsFilters {
  jobId?: string;
  search?: string;
}

/**
 * Org-wide version of getJobApplicationsForReview (job-candidates.ts) — same
 * select shape, with job title added since a candidate can now be shown
 * alongside applications from many different jobs. Kept as its own query
 * rather than overloading getJobApplicationsForReview so that function's
 * simpler, job-scoped contract doesn't change for its existing callers.
 */
export async function getPipelineApplications(orgId: string, filters: GetPipelineApplicationsFilters = {}) {
  const search = filters.search?.trim();
  return db.application.findMany({
    where: {
      orgId,
      ...(filters.jobId ? { jobId: filters.jobId } : {}),
      ...(search
        ? {
            OR: [
              { candidate: { name: { contains: search, mode: 'insensitive' as const } } },
              { candidate: { email: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      updatedAt: true,
      candidate: { select: { id: true, name: true, email: true } },
      job: { select: { id: true, title: true } },
      currentStage: { select: { id: true, name: true, color: true, order: true } },
      evaluation: { select: { overallScore: true } },
      resume: {
        select: {
          parseStatus: true,
          resumeEvaluation: { select: { overallScore: true } },
        },
      },
    },
  });
}

export type PipelineApplication = Awaited<ReturnType<typeof getPipelineApplications>>[number];
