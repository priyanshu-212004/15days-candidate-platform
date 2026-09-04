import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { listCandidates, type InterviewStatusFilter, type EvaluationStatusFilter } from '@/lib/queries/candidates';
import { listJobs } from '@/lib/queries/jobs';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/state';
import { StatusBadge } from '@/components/ui/status-badge';
import { CandidatesToolbar } from '@/components/candidates/candidates-toolbar';
import { initials, formatScore } from '@/lib/utils';
import { Users, Video, CheckCircle2, Star } from 'lucide-react';

const INTERVIEW_STATUSES: InterviewStatusFilter[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATED'];
const EVALUATION_STATUSES: EvaluationStatusFilter[] = ['NOT_EVALUATED', 'EVALUATED', 'SUCCESSFUL', 'UNSUCCESSFUL'];

/** Small horizontal bar next to the score number — quick visual read of where a candidate lands on the 0-10 scale. */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const tone = score >= 7 ? 'bg-success' : score >= 4 ? 'bg-warning' : 'bg-destructive';
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 font-medium tabular-nums">{formatScore(score)}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface PageProps {
  searchParams: { search?: string; jobId?: string; interviewStatus?: string; evaluationStatus?: string };
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const search = searchParams.search?.trim() || undefined;
  const jobId = searchParams.jobId || undefined;
  const interviewStatus = INTERVIEW_STATUSES.includes(searchParams.interviewStatus as InterviewStatusFilter)
    ? (searchParams.interviewStatus as InterviewStatusFilter)
    : undefined;
  const evaluationStatus = EVALUATION_STATUSES.includes(searchParams.evaluationStatus as EvaluationStatusFilter)
    ? (searchParams.evaluationStatus as EvaluationStatusFilter)
    : undefined;
  const hasFilters = Boolean(search || jobId || interviewStatus || evaluationStatus);

  const [candidates, jobs] = await Promise.all([
    listCandidates(session.user.orgId, { search, jobId, interviewStatus, evaluationStatus }),
    listJobs({ orgId: session.user.orgId }),
  ]);

  const inInterview = candidates.filter((c: (typeof candidates)[number]) => c.applications[0]?.status === 'IN_PROGRESS').length;
  const evaluated = candidates.filter((c: (typeof candidates)[number]) => !!c.applications[0]?.evaluation).length;
  const shortlisted = candidates.filter((c: (typeof candidates)[number]) => c.applications[0]?.currentStage?.name === 'Shortlisted').length;

  const summary = [
    { label: 'Total candidates', value: candidates.length, icon: Users, tone: 'primary' as const },
    { label: 'In interview', value: inInterview, icon: Video, tone: 'warning' as const },
    { label: 'Evaluated', value: evaluated, icon: CheckCircle2, tone: 'success' as const },
    { label: 'Shortlisted', value: shortlisted, icon: Star, tone: 'primary' as const },
  ];
  const toneClasses: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
        <p className="text-sm text-muted-foreground">Everyone who has started or completed an interview.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
                </div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${toneClasses[s.tone]}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CandidatesToolbar
        initialSearch={search ?? ''}
        initialJobId={jobId ?? ''}
        initialInterviewStatus={interviewStatus ?? ''}
        initialEvaluationStatus={evaluationStatus ?? ''}
        jobs={jobs.map((job: (typeof jobs)[number]) => ({ id: job.id, title: job.title }))}
      />

      {candidates.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={hasFilters ? 'No candidates match your filters' : 'No candidates yet'}
          description={
            hasFilters
              ? 'Try a different search term or clear a filter.'
              : "Once someone opens one of your interview links, they'll show up here."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Candidate</th>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Interview</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Pipeline stage</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {candidates.map((candidate: (typeof candidates)[number]) => {
                    const latest = candidate.applications[0];
                    return (
                      <tr key={candidate.id} className="transition-colors hover:bg-secondary/40">
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/candidates/${candidate.id}`} className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8 ring-1 ring-border">
                              <AvatarFallback className="text-xs font-semibold">{initials(candidate.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{candidate.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{candidate.email}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{latest?.job.title ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{latest?.interview.title ?? '—'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={latest?.status ?? 'PENDING'} />
                        </td>
                        <td className="px-4 py-3">
                          {latest?.currentStage ? (
                            <StatusBadge status={latest.currentStage.name} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {latest?.evaluation ? <ScoreBar score={latest.evaluation.overallScore} /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(candidate.updatedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
