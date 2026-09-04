'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CandidateProgress } from './candidate-progress';
import { RecordingPanel } from './recording-panel';
import { SubmissionReview } from './submission-review';
import { ResumeUploadPanel } from './resume-upload-panel';
import type { SessionData } from './types';

type LoadState = 'loading' | 'error' | 'ready';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function InterviewRunner({ token }: { token: string }) {
  const router = useRouter();
  const [loadState, setLoadState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [session, setSession] = React.useState<SessionData | null>(null);
  const [index, setIndex] = React.useState(0);
  const [reviewing, setReviewing] = React.useState(false);
  const [resumeStepDone, setResumeStepDone] = React.useState(false);
  const [draftText, setDraftText] = React.useState('');
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const fetchSession = React.useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await fetch(`/api/public/interviews/${token}/session`, { cache: 'no-store' });
      if (res.status === 401) {
        router.push(`/interview/${token}`);
        return;
      }
      if (!res.ok) {
        setLoadError('We could not load your interview. Please try refreshing the page.');
        setLoadState('error');
        return;
      }
      const data: SessionData = await res.json();

      if (data.status === 'SUBMITTED' || data.status === 'EVALUATED') {
        router.push(`/interview/${token}/complete`);
        return;
      }

      setSession(data);
      const startIndex = data.questions.findIndex((q) => !q.answered);
      setIndex(startIndex === -1 ? 0 : startIndex);
      setReviewing(startIndex === -1 && data.questions.length > 0);
      setLoadState('ready');
    } catch {
      setLoadError('Network error — please check your connection and try again.');
      setLoadState('error');
    }
  }, [token, router]);

  React.useEffect(() => {
    void fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const question = session?.questions[index] ?? null;
  // Fixed by the recruiter when the question was created — never a candidate
  // choice, and never changed here. The UI simply renders whichever single
  // input type this question requires.
  const mode: 'video' | 'text' = question?.requiredAnswerType === 'VIDEO' ? 'video' : 'text';
  const videoUnavailable = mode === 'video' && !session?.recordingEnabled;

  React.useEffect(() => {
    if (!question) return;
    setDraftText(question.answerText ?? '');
    setSaveState('idle');
    setSaveError(null);
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTextAnswer(): Promise<boolean> {
    if (!question) return false;
    if (!draftText.trim()) {
      setSaveError('Please write an answer before continuing.');
      setSaveState('error');
      return false;
    }

    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await fetch(`/api/public/interviews/${token}/answers/${question.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draftText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveError(data?.error ?? 'Could not save your answer. Please try again.');
        setSaveState('error');
        return false;
      }
      setSaveState('saved');
      updateLocalAnswer(question.id, { answered: true, answerType: 'TEXT', answerText: draftText });
      return true;
    } catch {
      setSaveError('Network error — your answer was not saved. Please try again.');
      setSaveState('error');
      return false;
    }
  }

  function updateLocalAnswer(questionId: string, patch: Partial<SessionData['questions'][number]>) {
    setSession((prev) => {
      if (!prev) return prev;
      const questions = prev.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q));
      const answeredCount = questions.filter((q) => q.answered).length;
      return {
        ...prev,
        questions,
        progress: {
          ...prev.progress,
          answeredCount,
          isComplete: answeredCount === questions.length,
        },
      };
    });
  }

  async function goNext() {
    if (!session || !question) return;

    if (mode === 'text') {
      const ok = await saveTextAnswer();
      if (!ok) return;
    } else if (!question.hasRecording && !question.answered) {
      setSaveError('Please record and upload your answer before continuing.');
      setSaveState('error');
      return;
    }

    if (index + 1 >= session.questions.length) {
      setReviewing(true);
    } else {
      setIndex(index + 1);
    }
  }

  function goBack() {
    if (index === 0) return;
    setIndex(index - 1);
  }

  if (loadState === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadState === 'error' || !session) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button onClick={() => void fetchSession()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  const needsResumeStep = session.requireCv && !session.resume && !resumeStepDone;
  if (needsResumeStep) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="p-6 sm:p-8">
          <ResumeUploadPanel
            token={token}
            initialResume={session.resume}
            onDone={() => {
              setResumeStepDone(true);
              void fetchSession();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  if (reviewing) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="p-6 sm:p-8">
          <SubmissionReview token={token} questions={session.questions} onBack={() => setReviewing(false)} />
        </CardContent>
      </Card>
    );
  }

  if (!question) return null;

  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="space-y-6 p-6 sm:p-8">
        <CandidateProgress current={index} total={session.questions.length} />

        <div className="space-y-2">
          <Badge variant="secondary">{question.type.replace('_', ' ')}</Badge>
          <p className="text-lg font-medium leading-snug">{question.text}</p>
          <p className="text-xs text-muted-foreground">
            {mode === 'video' ? 'Record your answer' : 'Enter your answer'}
          </p>
        </div>

        {videoUnavailable ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            Video recording isn&apos;t available for this interview right now. Please contact the recruiter — this
            question can&apos;t be answered as text.
          </div>
        ) : mode === 'video' ? (
          <RecordingPanel
            token={token}
            questionId={question.id}
            expectedDurationSec={question.expectedDurationSec}
            hasExistingRecording={question.hasRecording}
            onUploaded={(durationSec) => {
              updateLocalAnswer(question.id, { answered: true, answerType: 'VIDEO', hasRecording: true });
              void durationSec;
            }}
          />
        ) : (
          <div className="space-y-1.5">
            <Textarea
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value);
                setSaveState('idle');
              }}
              placeholder="Type your answer here…"
              rows={8}
              invalid={saveState === 'error'}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{draftText.length} / 8000 characters</span>
              {saveState === 'saving' && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
              {saveState === 'saved' && (
                <span className="flex items-center gap-1 text-success">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          </div>
        )}

        <div className="flex gap-2 border-t border-border pt-5">
          <Button type="button" variant="outline" onClick={goBack} disabled={index === 0}>
            Back
          </Button>
          <Button
            type="button"
            className="flex-1 gap-2"
            onClick={goNext}
            disabled={saveState === 'saving' || videoUnavailable}
          >
            {saveState === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
            {index + 1 >= session.questions.length ? 'Review answers' : 'Next question'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
