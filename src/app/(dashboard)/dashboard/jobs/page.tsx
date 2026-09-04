import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { listJobs } from '@/lib/queries/jobs';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';
import { JobsToolbar } from '@/components/jobs/jobs-toolbar';
import { JobCard } from '@/components/jobs/job-card';
import { JobViewToggle } from '@/components/jobs/job-view-toggle';
import { JobSwipeView } from '@/components/jobs/job-swipe-view';
import { Briefcase, Plus } from 'lucide-react';
import type { JobStatus } from '@prisma/client';

interface PageProps {
  searchParams: { search?: string; status?: string; view?: string };
}

const VALID_STATUSES: JobStatus[] = ['DRAFT', 'OPEN', 'PAUSED', 'ARCHIVED'];

export default async function JobsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const search = searchParams.search?.trim() || undefined;
  const status =
    searchParams.status && VALID_STATUSES.includes(searchParams.status as JobStatus)
      ? (searchParams.status as JobStatus)
      : undefined;
  const view = searchParams.view === 'swipe' ? 'swipe' : 'list';

  const jobs = await listJobs({ orgId: session.user.orgId, search, status });
  const hasFilters = Boolean(search || status);

  // One batched query for shortlisted counts per job — avoids an N+1 while
  // still reusing the existing Application/PipelineStage relationship
  // rather than adding a new field or duplicate API.
  const shortlistedGroups =
    jobs.length > 0
      ? await db.application.groupBy({
          by: ['jobId'],
          where: { orgId: session.user.orgId, currentStage: { name: 'Shortlisted' } },
          _count: { _all: true },
        })
      : [];
  const shortlistedByJobId = new Map(shortlistedGroups.map((g: (typeof shortlistedGroups)[number]) => [g.jobId, g._count._all]));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">Manage open roles and create AI interviews for them.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/jobs/new">
            <Plus className="h-4 w-4" />
            Create job
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <JobsToolbar initialSearch={search ?? ''} initialStatus={status ?? ''} />
        {jobs.length > 0 && <JobViewToggle view={view} />}
      </div>

      {jobs.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={<Briefcase className="h-5 w-5" />}
            title={hasFilters ? 'No jobs match your filters' : 'No jobs yet'}
            description={
              hasFilters
                ? 'Try a different search term or clear the status filter.'
                : 'Create your first job to start generating AI-powered interviews for it.'
            }
          />
          {!hasFilters && (
            <div className="flex justify-center">
              <Button asChild>
                <Link href="/dashboard/jobs/new">
                  <Plus className="h-4 w-4" />
                  Create job
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : view === 'swipe' ? (
        <JobSwipeView
          jobs={jobs.map((job: (typeof jobs)[number]) => ({
            id: job.id,
            title: job.title,
            status: job.status,
            location: job.location,
            remote: job.remote,
            employmentType: job.employmentType,
            createdAt: job.createdAt.toISOString(),
            _count: job._count,
            shortlistedCount: shortlistedByJobId.get(job.id) ?? 0,
          }))}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job: (typeof jobs)[number]) => (
            <JobCard
              key={job.id}
              job={{
                id: job.id,
                title: job.title,
                status: job.status,
                location: job.location,
                remote: job.remote,
                employmentType: job.employmentType,
                createdAt: job.createdAt.toISOString(),
                _count: job._count,
                shortlistedCount: shortlistedByJobId.get(job.id) ?? 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
