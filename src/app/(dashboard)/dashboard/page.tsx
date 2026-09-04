import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDashboardMetrics } from '@/lib/queries/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/state';
import { ScoreDistributionChart } from '@/components/dashboard/score-distribution-chart';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials, formatScore } from '@/lib/utils';
import { Briefcase, Users, Video, Star, Award, Plus, ArrowRight } from 'lucide-react';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const metrics = await getDashboardMetrics(session.user.orgId);

  const summaryCards = [
    { label: 'Active jobs', value: metrics.activeJobs, icon: Briefcase, href: '/dashboard/jobs' },
    { label: 'Total candidates', value: metrics.totalCandidates, icon: Users, href: '/dashboard/candidates' },
    { label: 'Interviews completed', value: metrics.interviewsCompleted, icon: Video, href: '/dashboard/candidates' },
    { label: 'Shortlisted', value: metrics.shortlisted, icon: Star, href: '/dashboard/pipeline' },
    { label: 'Offers extended', value: metrics.offers, icon: Award, href: '/dashboard/pipeline' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{session.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening across your hiring pipeline.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/jobs/new">Create job</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/interviews/new">
              <Plus className="h-4 w-4" />
              Create interview
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums">{card.value}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent candidates</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/candidates" className="gap-1 text-xs">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {metrics.recentCandidates.length === 0 ? (
              <EmptyState
                title="No candidates yet"
                description="Once candidates complete an interview, they'll show up here."
                action={{ label: 'Create your first interview', href: '/dashboard/jobs' }}
              />
            ) : (
              <div className="divide-y divide-border">
                {metrics.recentCandidates.map((app: (typeof metrics.recentCandidates)[number]) => (
                  <Link
                    key={app.id}
                    href={`/dashboard/candidates/${app.candidateId}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{initials(app.candidate.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{app.candidate.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{app.job.title}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {app.evaluation && (
                        <span className="text-sm font-semibold tabular-nums">
                          {formatScore(app.evaluation.overallScore)}
                        </span>
                      )}
                      <Badge variant="outline">{app.currentStage?.name ?? 'Applied'}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Candidate score distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreDistributionChart data={metrics.scoreDistribution} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent jobs</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/jobs" className="gap-1 text-xs">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {metrics.recentJobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              description="Create your first job to start generating AI interview questions."
            />
          ) : (
            <div className="divide-y divide-border">
              {metrics.recentJobs.map((job: (typeof metrics.recentJobs)[number]) => (
                <Link
                  key={job.id}
                  href={`/dashboard/jobs/${job.id}`}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:opacity-80"
                >
                  <div>
                    <p className="text-sm font-medium">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.location ?? 'Remote'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {job._count.applications} candidate{job._count.applications === 1 ? '' : 's'}
                    </span>
                    <Badge variant={job.status === 'OPEN' ? 'success' : 'secondary'}>{job.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
