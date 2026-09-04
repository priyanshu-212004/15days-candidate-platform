import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { JobForm } from '@/components/jobs/job-form';

export default function NewJobPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to jobs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Create a job</h1>
        <p className="text-sm text-muted-foreground">
          Add the role details recruiters and the AI interview generator will use.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <JobForm />
        </CardContent>
      </Card>
    </div>
  );
}
