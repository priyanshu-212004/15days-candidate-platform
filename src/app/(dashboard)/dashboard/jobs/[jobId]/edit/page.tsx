import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getJobById } from '@/lib/queries/jobs';
import { Card, CardContent } from '@/components/ui/card';
import { JobForm } from '@/components/jobs/job-form';

interface PageProps {
  params: { jobId: string };
}

export default async function EditJobPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const job = await getJobById(session.user.orgId, params.jobId);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link
          href={`/dashboard/jobs/${job.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to job
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Edit job</h1>
        <p className="text-sm text-muted-foreground">Update the role details.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <JobForm
            jobId={job.id}
            defaultValues={{
              title: job.title,
              description: job.description,
              requirements: job.requirements,
              skills: job.skills,
              experienceLevel: job.experienceLevel ?? '',
              location: job.location ?? '',
              remote: job.remote,
              employmentType: job.employmentType,
              status: job.status,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
