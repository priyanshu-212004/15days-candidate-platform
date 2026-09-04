'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, Loader2, Sparkles, PauseCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InterviewStatusBadge } from '@/components/jobs/job-status-badge';
import { useToast } from '@/components/ui/toast';
import { format } from 'date-fns';

interface PublishPanelProps {
  interviewId: string;
  jobId: string;
  status: string;
  publicToken: string;
  questionCount: number;
  estimatedDurationSec: number;
  expiresAt: string | null;
  canPublish: boolean;
}

export function PublishPanel({
  interviewId,
  jobId,
  status,
  publicToken,
  questionCount,
  estimatedDurationSec,
  expiresAt,
  canPublish,
}: PublishPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<'publish' | 'deactivate' | null>(null);
  const [copied, setCopied] = React.useState(false);

  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/interview/${publicToken}` : `/interview/${publicToken}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ variant: 'success', title: 'Link copied' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'error', title: 'Could not copy link', description: 'Copy it manually instead.' });
    }
  }

  async function handlePublish() {
    setBusy('publish');
    try {
      const res = await fetch(`/api/interviews/${interviewId}/publish`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not publish interview', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Interview published', description: 'The public link is now live.' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeactivate() {
    setBusy('deactivate');
    try {
      const res = await fetch(`/api/interviews/${interviewId}/deactivate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not deactivate interview', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Interview deactivated', description: 'The public link is no longer accepting responses.' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  const minutes = Math.max(1, Math.round(estimatedDurationSec / 60));

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Publish &amp; share</h2>
          <InterviewStatusBadge status={status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Questions</dt>
            <dd className="font-medium">{questionCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Estimated duration</dt>
            <dd className="font-medium">~{minutes} min</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Expires</dt>
            <dd className="font-medium">{expiresAt ? format(new Date(expiresAt), 'PPp') : 'No expiration set'}</dd>
          </div>
        </dl>

        {(status === 'ACTIVE' || status === 'PAUSED') && (
          <div className="space-y-2">
            <label htmlFor="public-link" className="text-xs text-muted-foreground">
              Public interview link
            </label>
            <div className="flex items-center gap-2">
              <input
                id="public-link"
                readOnly
                value={publicUrl}
                className="flex-1 truncate rounded-md border border-input bg-surface-sunken px-3 py-1.5 text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copy interview link">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/jobs/${jobId}/interviews/${interviewId}/preview`}>
              <ExternalLink className="h-3.5 w-3.5" /> Preview
            </Link>
          </Button>

          {status === 'DRAFT' || status === 'PAUSED' ? (
            <Button type="button" size="sm" onClick={handlePublish} disabled={!canPublish || busy === 'publish'}>
              {busy === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {status === 'PAUSED' ? 'Reactivate' : 'Publish interview'}
            </Button>
          ) : status === 'ACTIVE' ? (
            <Button type="button" variant="outline" size="sm" onClick={handleDeactivate} disabled={busy === 'deactivate'}>
              {busy === 'deactivate' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PauseCircle className="h-3.5 w-3.5" />
              )}
              Deactivate
            </Button>
          ) : null}
        </div>

        {status === 'DRAFT' && !canPublish && (
          <p className="text-xs text-muted-foreground">Add at least one question before publishing.</p>
        )}
      </CardContent>
    </Card>
  );
}
