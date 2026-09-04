import { db } from '@/lib/db';
import type { JobStatus, Prisma } from '@prisma/client';

export interface ListJobsParams {
  orgId: string;
  search?: string;
  status?: JobStatus;
}

export async function listJobs({ orgId, search, status }: ListJobsParams) {
  const where: Prisma.JobWhereInput = {
    orgId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { location: { contains: search, mode: 'insensitive' } },
            { skills: { has: search } },
          ],
        }
      : {}),
  };

  return db.job.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { applications: true, interviews: true } },
    },
  });
}

export async function getJobById(orgId: string, jobId: string) {
  return db.job.findFirst({
    where: { id: jobId, orgId, deletedAt: null },
    include: {
      _count: { select: { applications: true, interviews: true } },
      interviews: {
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { questions: true, applications: true } } },
      },
    },
  });
}
