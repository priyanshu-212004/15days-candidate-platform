'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronUp,
  ChevronDown,
  Pencil,
  Copy,
  Trash2,
  Sparkles,
  Loader2,
  Save,
  X,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TagInput } from '@/components/ui/tag-input';
import { useToast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import type { QuestionType, QuestionDifficulty, AnswerType } from '@prisma/client';

export interface QuestionData {
  id: string;
  text: string;
  type: QuestionType;
  category: string | null;
  difficulty: QuestionDifficulty;
  expectedDurationSec: number;
  evaluationCriteria: string[];
  order: number;
  aiGenerated: boolean;
  // Recruiter's choice for this question — never candidate-selectable.
  // See src/lib/validations/interview.ts (answerTypeEnum).
  answerType: AnswerType;
}

const TYPE_OPTIONS: QuestionType[] = ['BEHAVIORAL', 'TECHNICAL', 'SITUATIONAL', 'CULTURE_FIT'];
const DIFFICULTY_OPTIONS: QuestionDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const ANSWER_TYPE_OPTIONS: AnswerType[] = ['VIDEO', 'TEXT'];

function typeLabel(t: string) {
  return t
    .split('_')
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ');
}

function difficultyVariant(d: QuestionDifficulty): 'success' | 'warning' | 'destructive' {
  if (d === 'EASY') return 'success';
  if (d === 'MEDIUM') return 'warning';
  return 'destructive';
}

interface QuestionCardProps {
  interviewId: string;
  question: QuestionData;
  index: number;
  total: number;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDeleted: (id: string) => void;
  onUpdated: (question: QuestionData) => void;
  onDuplicated: (question: QuestionData) => void;
}

export function QuestionCard({
  interviewId,
  question,
  index,
  total,
  onMove,
  onDeleted,
  onUpdated,
  onDuplicated,
}: QuestionCardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState<'save' | 'delete' | 'duplicate' | 'regenerate' | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const [draft, setDraft] = React.useState({
    text: question.text,
    type: question.type,
    category: question.category ?? '',
    difficulty: question.difficulty,
    expectedDurationSec: question.expectedDurationSec,
    evaluationCriteria: question.evaluationCriteria,
    answerType: question.answerType,
  });

  function resetDraft() {
    setDraft({
      text: question.text,
      type: question.type,
      category: question.category ?? '',
      difficulty: question.difficulty,
      expectedDurationSec: question.expectedDurationSec,
      evaluationCriteria: question.evaluationCriteria,
      answerType: question.answerType,
    });
  }

  async function handleSave() {
    if (draft.text.trim().length < 10) {
      toast({ variant: 'error', title: 'Question is too short', description: 'Use at least 10 characters.' });
      return;
    }
    setBusy('save');
    try {
      const res = await fetch(`/api/interviews/${interviewId}/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not save question', description: data.error });
        return;
      }
      onUpdated(data.question);
      setEditing(false);
      toast({ variant: 'success', title: 'Question saved' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy('delete');
    try {
      const res = await fetch(`/api/interviews/${interviewId}/questions/${question.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'error', title: 'Could not delete question', description: data.error });
        return;
      }
      onDeleted(question.id);
      toast({ variant: 'success', title: 'Question deleted' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusy(null);
      setDeleteOpen(false);
    }
  }

  async function handleDuplicate() {
    setBusy('duplicate');
    try {
      const res = await fetch(`/api/interviews/${interviewId}/questions/${question.id}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not duplicate question', description: data.error });
        return;
      }
      onDuplicated(data.question);
      toast({ variant: 'success', title: 'Question duplicated' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate() {
    setBusy('regenerate');
    try {
      const res = await fetch(`/api/interviews/${interviewId}/questions/${question.id}/regenerate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not regenerate question', description: data.error });
        return;
      }
      onUpdated(data.question);
      toast({ variant: 'success', title: 'Question regenerated' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {index + 1}
            </span>
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Move question up"
                disabled={index === 0}
                onClick={() => onMove(question.id, 'up')}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Move question down"
                disabled={index === total - 1}
                onClick={() => onMove(question.id, 'down')}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {!editing ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{typeLabel(question.type)}</Badge>
                  <Badge variant={difficultyVariant(question.difficulty)}>{typeLabel(question.difficulty)}</Badge>
                  <Badge variant={question.answerType === 'VIDEO' ? 'default' : 'outline'}>
                    {question.answerType === 'VIDEO' ? 'Video answer' : 'Text answer'}
                  </Badge>
                  {question.category && <Badge variant="outline">{question.category}</Badge>}
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    ~{Math.round(question.expectedDurationSec / 60) || 1} min
                  </span>
                </div>
                <p className="text-sm">{question.text}</p>
                {question.evaluationCriteria.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {question.evaluationCriteria.map((c, i) => (
                      <li key={i}>· {c}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={draft.text}
                  onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                  rows={3}
                  aria-label="Question text"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v as QuestionType }))}>
                      <SelectTrigger aria-label="Question type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {typeLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Difficulty</Label>
                    <Select
                      value={draft.difficulty}
                      onValueChange={(v) => setDraft((d) => ({ ...d, difficulty: v as QuestionDifficulty }))}
                    >
                      <SelectTrigger aria-label="Question difficulty">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {typeLabel(d)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duration (sec)</Label>
                    <Input
                      type="number"
                      min={30}
                      max={600}
                      value={draft.expectedDurationSec}
                      onChange={(e) => setDraft((d) => ({ ...d, expectedDurationSec: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Answer type</Label>
                  <Select
                    value={draft.answerType}
                    onValueChange={(v) => setDraft((d) => ({ ...d, answerType: v as AnswerType }))}
                  >
                    <SelectTrigger aria-label="Answer type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANSWER_TYPE_OPTIONS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a === 'VIDEO' ? 'Video' : 'Text'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The candidate will only see this format — they can&apos;t switch.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Evaluation criteria</Label>
                  <TagInput
                    value={draft.evaluationCriteria}
                    onChange={(v) => setDraft((d) => ({ ...d, evaluationCriteria: v }))}
                    placeholder="Add a criterion, press Enter"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetDraft();
                      setEditing(false);
                    }}
                    disabled={busy === 'save'}
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={handleSave} disabled={busy === 'save'}>
                    {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                </div>
              </div>
            )}

            {!editing && (
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleDuplicate} disabled={busy === 'duplicate'}>
                  {busy === 'duplicate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  Duplicate
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleRegenerate} disabled={busy === 'regenerate'}>
                  {busy === 'regenerate' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Regenerate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. Remaining questions will be renumbered.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy === 'delete'}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={busy === 'delete'}>
              {busy === 'delete' && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
