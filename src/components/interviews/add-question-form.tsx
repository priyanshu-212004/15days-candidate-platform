'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import type { QuestionData } from '@/components/interviews/question-card';
import type { QuestionType, QuestionDifficulty, AnswerType } from '@prisma/client';

export function AddQuestionForm({
  interviewId,
  onAdded,
}: {
  interviewId: string;
  onAdded: (question: QuestionData) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [text, setText] = React.useState('');
  const [type, setType] = React.useState<QuestionType>('BEHAVIORAL');
  const [difficulty, setDifficulty] = React.useState<QuestionDifficulty>('MEDIUM');
  const [duration, setDuration] = React.useState(120);
  const [answerType, setAnswerType] = React.useState<AnswerType>('VIDEO');

  async function handleAdd() {
    if (text.trim().length < 10) {
      toast({ variant: 'error', title: 'Question is too short', description: 'Use at least 10 characters.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          type,
          difficulty,
          expectedDurationSec: duration,
          evaluationCriteria: [],
          answerType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not add question', description: data.error });
        return;
      }
      onAdded(data.question);
      setText('');
      setOpen(false);
      toast({ variant: 'success', title: 'Question added' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add question
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">New question</Label>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cancel adding question" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. Tell me about a time you disagreed with a technical decision."
          autoFocus
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as QuestionType)}>
              <SelectTrigger aria-label="Question type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['BEHAVIORAL', 'TECHNICAL', 'SITUATIONAL', 'CULTURE_FIT'] as const).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Difficulty</Label>
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as QuestionDifficulty)}>
              <SelectTrigger aria-label="Question difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['EASY', 'MEDIUM', 'HARD'] as const).map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Duration (sec)</Label>
            <Input type="number" min={30} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Answer type</Label>
            <Select value={answerType} onValueChange={(v) => setAnswerType(v as AnswerType)}>
              <SelectTrigger aria-label="Answer type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['VIDEO', 'TEXT'] as const).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a === 'VIDEO' ? 'Video' : 'Text'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add question
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
