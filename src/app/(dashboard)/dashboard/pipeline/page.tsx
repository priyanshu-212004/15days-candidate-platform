import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getPipelineApplications } from '@/lib/queries/pipeline';
import { listOrgPipelineStages } from '@/lib/queries/candidates';
import { listJobs } from '@/lib/queries/jobs';
import { Card, CardContent } from '@/components/ui/card';
import { PipelineBoard } from '@/components/jobs/pipeline-board';
import { PipelineToolbar } from '@/components/jobs/pipeline-toolbar';
import { Users, Star, Trophy, XCircle } from 'lucide-react';

interface PageProps {
  searchParams: { search?: string; jobId?: string };
}

export default async function PipelinePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const search = searchParams.search?.trim() || undefined;
  const jobId = searchParams.jobId || undefined;

  const [applications, stages, jobs] = await Promise.all([
    getPipelineApplications(session.user.orgId, { search, jobId }),
    listOrgPipelineStages(session.user.orgId),
    listJobs({ orgId: session.user.orgId }),
  ]);

  const stageCount = (name: string) =>
    applications.filter((a: (typeof applications)[number]) => a.currentStage?.name === name).length;

  const summary = [
    { label: 'Total in pipeline', value: applications.length, icon: Users },
    { label: 'Shortlisted', value: stageCount('Shortlisted'), icon: Star },
    { label: 'Hired', value: stageCount('Hired'), icon: Trophy },
    { label: 'Rejected', value: stageCount('Rejected'), icon: XCircle },
  ];

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Every candidate across every job, grouped by stage.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PipelineToolbar
        initialSearch={search ?? ''}
        initialJobId={jobId ?? ''}
        jobs={jobs.map((job: (typeof jobs)[number]) => ({ id: job.id, title: job.title }))}
      />

      <PipelineBoard applications={applications} stages={stages} />
    </div>
  );
}
