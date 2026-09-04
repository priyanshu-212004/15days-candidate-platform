'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight, Clock, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PreviewQuestion {
  text: string;
  expectedDurationSec: number;
}

export function CandidatePreviewShell({
  jobTitle,
  interviewTitle,
  questions,
}: {
  jobTitle: string;
  interviewTitle: string;
  questions: PreviewQuestion[];
}) {
  const [index, setIndex] = React.useState(0);
  const question = questions[index];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div
        role="status"
        className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
      >
        <Eye className="h-3.5 w-3.5" />
        Preview mode — nothing here is recorded or saved as a candidate response.
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{jobTitle}</p>
            <h1 className="text-lg font-semibold">{interviewTitle}</h1>
          </div>

          {questions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              This interview has no questions yet. Add questions before previewing.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Question {index + 1} of {questions.length}
                </span>
                <Badge variant="secondary">
                  <Clock className="h-3 w-3" />~{Math.max(1, Math.round(question!.expectedDurationSec / 60))} min
                </Badge>
              </div>

              <div className="rounded-lg border border-border bg-surface-sunken p-5">
                <p className="text-center text-base">{question!.text}</p>
              </div>

              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Video recording will appear here once the candidate experience ships.
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={index === questions.length - 1}
                  onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
