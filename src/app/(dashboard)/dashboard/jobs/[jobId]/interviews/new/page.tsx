import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getJobById } from '@/lib/queries/jobs';
import { NewInterviewWizard } from '@/components/interviews/new-interview-wizard';

interface PageProps {
  params: { jobId: string };
}

export default async function NewInterviewPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const job = await getJobById(session.user.orgId, params.jobId);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href={`/dashboard/jobs/${job.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {job.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Create AI interview</h1>
        <p className="text-sm text-muted-foreground">
          Set up the interview, then AI will draft questions from the job description. You&apos;ll review and edit them
          before publishing.
        </p>
      </div>

      <NewInterviewWizard jobId={job.id} jobTitle={job.title} />
    </div>
  );
}
