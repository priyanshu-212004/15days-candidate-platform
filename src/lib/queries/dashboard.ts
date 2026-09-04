import { db } from '@/lib/db';

export async function getDashboardMetrics(orgId: string) {
  const [activeJobs, totalCandidates, interviewsCompleted, shortlisted, offers, recentCandidates, recentJobs] =
    await Promise.all([
      db.job.count({ where: { orgId, status: 'OPEN', deletedAt: null } }),
      db.candidate.count({ where: { orgId } }),
      db.application.count({ where: { orgId, status: 'SUBMITTED' } }),
      db.application.count({ where: { orgId, currentStage: { name: 'Shortlisted' } } }),
      db.application.count({ where: { orgId, currentStage: { name: 'Offer' } } }),
      db.application.findMany({
        where: { orgId },
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          candidate: true,
          job: true,
          evaluation: true,
          currentStage: true,
        },
      }),
      db.job.findMany({
        where: { orgId, deletedAt: null },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { applications: true } } },
      }),
    ]);

  const scoreDistributionRaw = await db.evaluation.findMany({
    where: { application: { orgId } },
    select: { overallScore: true },
  });

  const buckets = [0, 0, 0, 0, 0]; // 0-2,2-4,4-6,6-8,8-10
  for (const { overallScore } of scoreDistributionRaw) {
    const idx = Math.min(4, Math.floor(overallScore / 2));
    buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  const scoreDistribution = [
    { range: '0-2', count: buckets[0] ?? 0 },
    { range: '2-4', count: buckets[1] ?? 0 },
    { range: '4-6', count: buckets[2] ?? 0 },
    { range: '6-8', count: buckets[3] ?? 0 },
    { range: '8-10', count: buckets[4] ?? 0 },
  ];

  return {
    activeJobs,
    totalCandidates,
    interviewsCompleted,
    shortlisted,
    offers,
    recentCandidates,
    recentJobs,
    scoreDistribution,
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;
