import { db } from '@/lib/db';
import { computeOrgAnalytics } from '@/lib/queries/analytics-pure';

export interface AnalyticsFilters {
  jobId?: string;
  /** Inclusive start of the date range, applied to Application.createdAt. */
  dateFrom?: Date;
  /** Inclusive end of the date range, applied to Application.createdAt. */
  dateTo?: Date;
}

export async function getOrgAnalytics(orgId: string, filters: AnalyticsFilters = {}) {
  const where = {
    orgId,
    ...(filters.jobId ? { jobId: filters.jobId } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };

  const applications = await db.application.findMany({
    where,
    select: {
      id: true,
      status: true,
      createdAt: true,
      job: { select: { id: true, title: true } },
      currentStage: { select: { name: true } },
      evaluation: { select: { overallScore: true } },
    },
  });

  return computeOrgAnalytics(applications);
}

export type OrgAnalytics = Awaited<ReturnType<typeof getOrgAnalytics>>;
