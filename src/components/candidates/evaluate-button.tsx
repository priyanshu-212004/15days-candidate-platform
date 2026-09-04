'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  candidateId: string;
  applicationId: string;
  /** Which endpoint to call — interview-answer evaluation (default) or resume evaluation. */
  target?: 'interview' | 'resume';
  label?: string;
}

export function EvaluateButton({ candidateId, applicationId, target = 'interview', label }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const path = target === 'resume' ? 'evaluate-resume' : 'evaluate';
      const res = await fetch(`/api/candidates/${candidateId}/applications/${applicationId}/${path}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Evaluation failed. Please try again.');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error — please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" onClick={handleClick} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {label ?? (target === 'resume' ? 'Run resume evaluation' : 'Run AI evaluation')}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
