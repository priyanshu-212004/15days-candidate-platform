'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Archive, Users, Video, MapPin, ExternalLink, Loader2, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JobStatusBadge } from '@/components/jobs/job-status-badge';
import { useToast } from '@/components/ui/toast';
import type { JobCardData } from '@/components/jobs/job-card';

export function JobSwipeView({ jobs }: { jobs: JobCardData[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [index, setIndex] = React.useState(0);
  const [archiving, setArchiving] = React.useState(false);

  // The underlying job list can change (e.g. after archiving) — clamp so a
  // stale index never points past the end.
  const clampedIndex = Math.min(index, Math.max(0, jobs.length - 1));
  const job = jobs[clampedIndex];

  function goPrev() {
    setIndex((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setIndex((i) => Math.min(jobs.length - 1, i + 1));
  }

  async function handleArchive() {
    if (!job || job.status === 'ARCHIVED') return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not archive job', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Job archived', description: job.title });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setArchiving(false);
    }
  }

  if (!job) return null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-center text-xs text-muted-foreground">
        {clampedIndex + 1} of {jobs.length}
      </p>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{job.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {job.location}
                    {job.remote && ' · Remote'}
                  </span>
                )}
                <span>{job.employmentType.replace('_', ' ')}</span>
              </div>
            </div>
            <JobStatusBadge status={job.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" /> {job._count.applications} applicants
            </div>
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" /> {job._count.interviews} interviews
            </div>
            {typeof job.shortlistedCount === 'number' && (
              <div className="col-span-2 flex items-center gap-2">
                <Star className="h-4 w-4 text-indigo-500" /> {job.shortlistedCount} shortlisted
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button variant="outline" size="icon" onClick={goPrev} disabled={clampedIndex === 0} aria-label="Previous job">
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleArchive} disabled={archiving || job.status === 'ARCHIVED'} className="gap-1.5">
                {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                {job.status === 'ARCHIVED' ? 'Archived' : 'Archive'}
              </Button>
              <Button asChild className="gap-1.5">
                <Link href={`/dashboard/jobs/${job.id}`}>
                  <ExternalLink className="h-4 w-4" /> Open
                </Link>
              </Button>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={goNext}
              disabled={clampedIndex === jobs.length - 1}
              aria-label="Next job"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
