'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionQuestion } from './types';

interface Props {
  token: string;
  questions: SessionQuestion[];
  onBack: () => void;
}

export function SubmissionReview({ token, questions, onBack }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const answeredCount = questions.filter((q) => q.answered).length;
  const allAnswered = answeredCount === questions.length;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/interviews/${token}/submit`, { method: 'POST' });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong submitting your interview. Please try again.');
        setSubmitting(false);
        return;
      }

      // Success covers both a fresh submission and an idempotent replay of
      // an already-submitted session — either way the candidate is done.
      router.push(`/interview/${token}/complete`);
    } catch {
      setError('Network error — please check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Review your answers</h2>
        <p className="text-sm text-muted-foreground">
          {answeredCount} of {questions.length} questions answered.
        </p>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {questions.map((q, i) => (
          <li key={q.id} className="flex items-start gap-3 p-3.5">
            {q.answered ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">Question {i + 1}</p>
              <p className="truncate text-xs text-muted-foreground">{q.text}</p>
              {q.answered && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {q.answerType === 'VIDEO' ? 'Recorded response' : 'Written response'}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!allAnswered && (
        <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          Please answer every question before submitting.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="button" className="flex-1 gap-2" onClick={handleSubmit} disabled={!allAnswered || submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit interview
        </Button>
      </div>
    </div>
  );
}
