import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listMarketplaceJobs } from '@/lib/queries/candidate-jobs';
import { JobFilters } from '@/components/candidate/job-filters';
import { JobCard } from '@/components/candidate/job-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { SearchX } from 'lucide-react';
import Link from 'next/link';

interface SearchParams {
  q?: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  page?: string;
}

export default async function CandidateJobsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'CANDIDATE') redirect('/login');

  const page = searchParams.page ? Number(searchParams.page) : 1;
  const workMode = searchParams.workMode === 'REMOTE' || searchParams.workMode === 'ON_SITE' ? searchParams.workMode : undefined;
  const employmentType = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'].includes(searchParams.employmentType ?? '')
    ? (searchParams.employmentType as 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP')
    : undefined;

  const { jobs, total, totalPages } = await listMarketplaceJobs({
    q: searchParams.q,
    location: searchParams.location,
    workMode,
    employmentType,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  });

  const basePath = '/candidate/jobs';
  const query = new URLSearchParams();
  if (searchParams.q) query.set('q', searchParams.q);
  if (searchParams.location) query.set('location', searchParams.location);
  if (workMode) query.set('workMode', workMode);
  if (employmentType) query.set('employmentType', employmentType);

  function pageHref(p: number) {
    const params = new URLSearchParams(query);
    params.set('page', String(p));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Find jobs</h1>
        <p className="text-sm text-muted-foreground">{total} open role{total === 1 ? '' : 's'} across all companies</p>
      </div>

      <JobFilters
        initial={{ q: searchParams.q, location: searchParams.location, workMode, employmentType }}
      />

      <div className="space-y-3">
        {jobs.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="No open roles match your search"
            description="Try broadening your filters or searching a different keyword."
          />
        )}
        {jobs.map(
          (job: {
            id: string;
            title: string;
            location: string | null;
            remote: boolean;
            employmentType: string;
            experienceLevel: string | null;
            skills: string[];
            createdAt: Date;
            org: { name: string; logoUrl: string | null };
          }) => (
            <JobCard key={job.id} job={job} />
          )
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1}>
              Previous
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
            <Link href={pageHref(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}>
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
