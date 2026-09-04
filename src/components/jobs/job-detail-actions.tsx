'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export function JobDetailActions({ jobId, jobTitle, status }: { jobId: string; jobTitle: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);

  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not archive job', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Job archived', description: jobTitle });
      setDialogOpen(false);
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline">
        <Link href={`/dashboard/jobs/${jobId}/edit`}>Edit</Link>
      </Button>
      {status !== 'ARCHIVED' && (
        <Button variant="outline" className="text-destructive hover:bg-destructive/5" onClick={() => setDialogOpen(true)}>
          Archive
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive &ldquo;{jobTitle}&rdquo;?</DialogTitle>
            <DialogDescription>
              Archived jobs are hidden from the active jobs list but keep their history.
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
    </div>
  );
}
