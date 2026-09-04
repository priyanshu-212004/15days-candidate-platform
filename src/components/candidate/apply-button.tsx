'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

export function ApplyButton({
  jobId,
  canApply,
  alreadyApplied,
}: {
  jobId: string;
  canApply: boolean;
  alreadyApplied: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);

  if (alreadyApplied) {
    return (
      <Button variant="outline" disabled className="gap-1.5">
        <CheckCircle2 className="h-4 w-4" /> Already Applied
      </Button>
    );
  }

  if (!canApply) {
    return (
      <Button variant="outline" disabled>
        Not accepting applications
      </Button>
    );
  }

  async function handleApply() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/candidate/jobs/${jobId}/apply`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not submit application', description: data?.error });
        return;
      }
      toast({ variant: 'success', title: 'Application submitted' });
      router.push(`/candidate/applications/${data.application.id}`);
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button onClick={handleApply} disabled={submitting} className="gap-1.5">
      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
      Apply Now
    </Button>
  );
}
