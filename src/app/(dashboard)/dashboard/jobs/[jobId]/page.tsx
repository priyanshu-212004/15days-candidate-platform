import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getJobById } from '@/lib/queries/jobs';
import { getJobApplicationsForReview, rankCandidates, computeJobAnalytics } from '@/lib/queries/job-candidates';
import { listOrgPipelineStages } from '@/lib/queries/candidates';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/state';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { JobStatusBadge, InterviewStatusBadge } from '@/components/jobs/job-status-badge';
import { JobDetailActions } from '@/components/jobs/job-detail-actions';
import { CandidateRankingTable } from '@/components/jobs/candidate-ranking-table';
import { PipelineBoard } from '@/components/jobs/pipeline-board';
import { JobAnalyticsPanel } from '@/components/jobs/job-analytics-panel';
import { formatDistanceToNow } from 'date-fns';
import { MapPin, Video, Sparkles, Users, ArrowUpRight } from 'lucide-react';

interface PageProps {
  params: { jobId: string };
}

export default async function JobDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const job = await getJobById(session.user.orgId, params.jobId);
  if (!job) notFound();

  const [applications, stages] = await Promise.all([
    getJobApplicationsForReview(session.user.orgId, job.id),
    listOrgPipelineStages(session.user.orgId),
  ]);
  const ranked = rankCandidates(applications);
  const analytics = computeJobAnalytics(applications);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {job.location}
                {job.remote && ' · Remote'}
              </span>
            )}
            <span>{job.employmentType.replace('_', ' ').toLowerCase()}</span>
            <span>Created {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button asChild size="lg">
            <Link href={`/dashboard/jobs/${job.id}/interviews/new`}>
              <Sparkles className="h-4 w-4" />
              Create AI interview
            </Link>
          </Button>
          <JobDetailActions jobId={job.id} jobTitle={job.title} status={job.status} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="interviews">Interviews ({job.interviews.length})</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="space-y-5 p-5">
                <div className="space-y-1.5">
                  <h2 className="text-sm font-semibold">Description</h2>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.description}</p>
                </div>
                {job.requirements.length > 0 && (
                  <div className="space-y-1.5">
                    <h2 className="text-sm font-semibold">Requirements</h2>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {job.requirements.map((r: string) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-5">
                <div>
                  <h2 className="text-sm font-semibold">Skills</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.skills.length === 0 && <p className="text-sm text-muted-foreground">None listed</p>}
                    {job.skills.map((s: string) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                {job.experienceLevel && (
                  <div>
                    <h2 className="text-sm font-semibold">Experience level</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{job.experienceLevel}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {job._count.applications} candidates
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    {job._count.interviews} interviews
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="interviews">
          {job.interviews.length === 0 ? (
            <EmptyState
              icon={<Video className="h-5 w-5" />}
              title="No interviews yet"
              description="Create an AI-generated interview for this job to start collecting candidate responses."
            />
          ) : (
            <div className="space-y-3">
              {job.interviews.map((interview: (typeof job.interviews)[number]) => (
                <Link key={interview.id} href={`/dashboard/jobs/${job.id}/interviews/${interview.id}`}>
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{interview.title}</span>
                          <InterviewStatusBadge status={interview.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {interview.interviewType === 'ADAPTIVE_VOICE'
                            ? 'Adaptive voice interview'
                            : `${interview._count.questions} questions`}{' '}
                          · {interview._count.applications} responses
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="candidates">
          <CandidateRankingTable rows={ranked} />
        </TabsContent>

        <TabsContent value="pipeline">
          <PipelineBoard applications={applications} stages={stages} />
        </TabsContent>

        <TabsContent value="analytics">
          <JobAnalyticsPanel analytics={analytics} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
