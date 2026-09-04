'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreVertical, Users, Video, MapPin, Loader2, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { JobStatusBadge } from '@/components/jobs/job-status-badge';
import { useToast } from '@/components/ui/toast';
import { formatDistanceToNow } from 'date-fns';

export interface JobCardData {
  id: string;
  title: string;
  status: string;
  location: string | null;
  remote: boolean;
  employmentType: string;
  createdAt: string;
  _count: { applications: number; interviews: number };
  shortlistedCount?: number;
}

export function JobCard({ job }: { job: JobCardData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [archiving, setArchiving] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not archive job', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Job archived', description: job.title });
      setDialogOpen(false);
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Card className="group h-full transition-colors hover:border-primary/40">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <Link href={`/dashboard/jobs/${job.id}`} className="line-clamp-1 font-semibold tracking-tight hover:underline">
              {job.title}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5">
              <JobStatusBadge status={job.status} />
              <span className="text-xs text-muted-foreground">
                {job.employmentType.replace('_', ' ').toLowerCase()}
              </span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${job.title}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/jobs/${job.id}`}>View details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/jobs/${job.id}/edit`}>Edit</Link>
              </DropdownMenuItem>
              {job.status !== 'ARCHIVED' && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setDialogOpen(true);
                  }}
                >
                  Archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {job.location && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {job.location}
            {job.remote && ' · Remote'}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {job._count.applications}
            </span>
            <span className="flex items-center gap-1">
              <Video className="h-3.5 w-3.5" /> {job._count.interviews}
            </span>
            {typeof job.shortlistedCount === 'number' && job.shortlistedCount > 0 && (
              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                <Star className="h-3.5 w-3.5" /> {job.shortlistedCount}
              </span>
            )}
          </div>
          <span>{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive &ldquo;{job.title}&rdquo;?</DialogTitle>
            <DialogDescription>
              Archived jobs are hidden from the active jobs list but keep their history — candidates,
              interviews, and applications are preserved. You can&apos;t reopen it from here yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={archiving}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleArchive} disabled={archiving}>
              {archiving && <Loader2 className="h-4 w-4 animate-spin" />}
              Archive job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
