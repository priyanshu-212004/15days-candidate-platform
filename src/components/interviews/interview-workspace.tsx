'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { QuestionEditor } from '@/components/interviews/question-editor';
import { BlueprintEditor, type BlueprintDraft } from '@/components/interviews/blueprint-editor';
import { PublishPanel } from '@/components/interviews/publish-panel';
import { useToast } from '@/components/ui/toast';
import type { QuestionData } from '@/components/interviews/question-card';

interface InterviewWorkspaceProps {
  interviewId: string;
  jobId: string;
  status: string;
  publicToken: string;
  questions: QuestionData[];
  expiresAt: string | null;
  interviewType: 'STATIC' | 'ADAPTIVE_VOICE';
  blueprint: BlueprintDraft | null;
}

export function InterviewWorkspace({
  interviewId,
  jobId,
  status,
  publicToken,
  questions,
  expiresAt,
  interviewType,
  blueprint,
}: InterviewWorkspaceProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [regenerating, setRegenerating] = React.useState(false);
  const [currentBlueprint, setCurrentBlueprint] = React.useState<BlueprintDraft | null>(blueprint);

  const isAdaptive = interviewType === 'ADAPTIVE_VOICE';
  const estimatedDurationSec = isAdaptive
    ? (currentBlueprint?.durationTargetMin ?? 20) * 60
    : questions.reduce((sum, q) => sum + q.expectedDurationSec, 0);
  const isDraft = status === 'DRAFT';

  async function handleRegenerateAll() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionCount: Math.max(3, questions.length || 6) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not regenerate questions', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Questions regenerated', description: `${data.questions.length} new questions` });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <h2 className="text-sm font-semibold">
          {isAdaptive ? 'Evaluation blueprint' : 'Questions'}{' '}
          {!isDraft && <span className="font-normal text-muted-foreground">(read-only after publishing)</span>}
        </h2>
        {isAdaptive ? (
          <BlueprintEditor
            interviewId={interviewId}
            initialBlueprint={currentBlueprint}
            readOnly={!isDraft}
            onSaved={(b) => {
              setCurrentBlueprint(b);
              router.refresh();
            }}
          />
        ) : isDraft ? (
          <QuestionEditor
            interviewId={interviewId}
            initialQuestions={questions}
            onRegenerateAll={handleRegenerateAll}
            regenerating={regenerating}
          />
        ) : (
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-lg border border-border bg-card p-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Question {i + 1}</p>
                <p className="text-sm">{q.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <PublishPanel
          interviewId={interviewId}
          jobId={jobId}
          status={status}
          publicToken={publicToken}
          questionCount={isAdaptive ? (currentBlueprint?.evaluationAreas.length ?? 0) : questions.length}
          estimatedDurationSec={estimatedDurationSec}
          expiresAt={expiresAt}
          canPublish={isAdaptive ? !!currentBlueprint && currentBlueprint.evaluationAreas.length > 0 : questions.length > 0}
        />
      </div>
    </div>
  );
}
