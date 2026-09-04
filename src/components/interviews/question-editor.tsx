'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';
import { useToast } from '@/components/ui/toast';
import { QuestionCard, type QuestionData } from '@/components/interviews/question-card';
import { AddQuestionForm } from '@/components/interviews/add-question-form';
import { ListChecks } from 'lucide-react';

export function QuestionEditor({
  interviewId,
  initialQuestions,
  onRegenerateAll,
  regenerating,
}: {
  interviewId: string;
  initialQuestions: QuestionData[];
  onRegenerateAll?: () => void;
  regenerating?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [questions, setQuestions] = React.useState<QuestionData[]>(
    [...initialQuestions].sort((a, b) => a.order - b.order)
  );

  React.useEffect(() => {
    setQuestions([...initialQuestions].sort((a, b) => a.order - b.order));
  }, [initialQuestions]);

  function handleDeleted(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id).map((q, i) => ({ ...q, order: i })));
  }

  function handleUpdated(question: QuestionData) {
    setQuestions((prev) => prev.map((q) => (q.id === question.id ? question : q)));
  }

  function handleDuplicated(question: QuestionData) {
    setQuestions((prev) => {
      const next = [...prev];
      next.splice(question.order, 0, question);
      return next.map((q, i) => ({ ...q, order: i }));
    });
  }

  function handleAdded(question: QuestionData) {
    setQuestions((prev) => [...prev, question]);
  }

  async function persistOrder(next: QuestionData[]) {
    try {
      const res = await fetch(`/api/interviews/${interviewId}/questions/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map((q) => q.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'error', title: 'Could not save new order', description: data.error });
        return;
      }
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Order was not saved.' });
    }
  }

  function handleMove(id: string, direction: 'up' | 'down') {
    setQuestions((prev) => {
      const index = prev.findIndex((q) => q.id === id);
      const swapWith = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
      const reindexed = next.map((q, i) => ({ ...q, order: i }));
      void persistOrder(reindexed);
      return reindexed;
    });
  }

  return (
    <div className="space-y-4">
      {questions.length > 0 && onRegenerateAll && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onRegenerateAll} disabled={regenerating}>
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Regenerate all with AI
          </Button>
        </div>
      )}

      {questions.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          title="No questions yet"
          description="Generate questions with AI or add them manually below."
        />
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              interviewId={interviewId}
              question={q}
              index={i}
              total={questions.length}
              onMove={handleMove}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
              onDuplicated={handleDuplicated}
            />
          ))}
        </div>
      )}

      <AddQuestionForm interviewId={interviewId} onAdded={handleAdded} />
    </div>
  );
}
