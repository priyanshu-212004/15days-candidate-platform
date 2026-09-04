import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getInterviewById } from '@/lib/queries/interviews';
import { InterviewWorkspace } from '@/components/interviews/interview-workspace';

interface PageProps {
  params: { jobId: string; interviewId: string };
}

export default async function InterviewDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const interview = await getInterviewById(session.user.orgId, params.interviewId);
  if (!interview || interview.jobId !== params.jobId) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link
          href={`/dashboard/jobs/${params.jobId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {interview.job.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{interview.title}</h1>
        <p className="text-sm text-muted-foreground">
          For {interview.job.title} · Max {interview.maxAttempts} attempt{interview.maxAttempts > 1 ? 's' : ''} ·{' '}
          {interview.languages.join(', ').toUpperCase()}
        </p>
      </div>

      <InterviewWorkspace
        interviewId={interview.id}
        jobId={params.jobId}
        status={interview.status}
        publicToken={interview.publicToken}
        expiresAt={interview.expiresAt ? interview.expiresAt.toISOString() : null}
        interviewType={interview.interviewType}
        blueprint={
          interview.blueprint
            ? {
                durationTargetMin: interview.blueprint.durationTargetMin,
                durationMinMin: interview.blueprint.durationMinMin,
                durationMaxMin: interview.blueprint.durationMaxMin,
                graceSeconds: interview.blueprint.graceSeconds,
                maxFollowUpsPerTopic: interview.blueprint.maxFollowUpsPerTopic,
                evaluationAreas: interview.blueprint.evaluationAreas as {
                  name: string;
                  weight: number;
                  targetLevel?: string;
                }[],
              }
            : null
        }
        questions={interview.questions.map((q: (typeof interview.questions)[number]) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          category: q.category,
          difficulty: q.difficulty,
          expectedDurationSec: q.expectedDurationSec,
          evaluationCriteria: q.evaluationCriteria,
          order: q.order,
          aiGenerated: q.aiGenerated,
          answerType: q.answerType,
        }))}
      />
    </div>
  );
}
