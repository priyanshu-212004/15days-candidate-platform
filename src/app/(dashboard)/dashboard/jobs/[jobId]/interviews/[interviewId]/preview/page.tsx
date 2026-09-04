import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getInterviewById } from '@/lib/queries/interviews';
import { CandidatePreviewShell } from '@/components/interviews/candidate-preview-shell';

interface PageProps {
  params: { jobId: string; interviewId: string };
}

export default async function InterviewPreviewPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const interview = await getInterviewById(session.user.orgId, params.interviewId);
  if (!interview || interview.jobId !== params.jobId) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/dashboard/jobs/${params.jobId}/interviews/${interview.id}`}
        className="mx-auto flex max-w-xl items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to interview
      </Link>
      <CandidatePreviewShell
        jobTitle={interview.job.title}
        interviewTitle={interview.title}
        questions={interview.questions
          .sort((a: (typeof interview.questions)[number], b: (typeof interview.questions)[number]) => a.order - b.order)
          .map((q: (typeof interview.questions)[number]) => ({ text: q.text, expectedDurationSec: q.expectedDurationSec }))}
      />
    </div>
  );
}
