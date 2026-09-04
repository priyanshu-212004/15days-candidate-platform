'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

interface NewInterviewWizardProps {
  jobId: string;
  jobTitle: string;
}

type Step = 'setup' | 'generating';

export function NewInterviewWizard({ jobId, jobTitle }: NewInterviewWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState<Step>('setup');
  const [error, setError] = React.useState<string | null>(null);

  const [interviewType, setInterviewType] = React.useState<'STATIC' | 'ADAPTIVE_VOICE'>('STATIC');
  const [title, setTitle] = React.useState(`${jobTitle} — AI Interview`);
  const [maxAttempts, setMaxAttempts] = React.useState(1);
  const [requireCv, setRequireCv] = React.useState(true);
  const [expiresInDays, setExpiresInDays] = React.useState('14');
  const [questionCount, setQuestionCount] = React.useState(6);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 3) {
      setError('Give the interview a title of at least 3 characters.');
      return;
    }

    setStep('generating');

    try {
      const expiresAt =
        expiresInDays && Number(expiresInDays) > 0
          ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      const createRes = await fetch(`/api/jobs/${jobId}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          maxAttempts,
          languages: ['en'],
          requireCv,
          expiresAt,
          interviewType,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setStep('setup');
        setError(createData.error || 'Could not create the interview.');
        return;
      }

      const interviewId = createData.interview.id as string;

      if (interviewType === 'ADAPTIVE_VOICE') {
        // No question list to generate — the recruiter sets up the
        // evaluation blueprint on the interview detail page instead.
        toast({ variant: 'success', title: 'Adaptive interview created', description: 'Next, set up what it should evaluate.' });
        router.push(`/dashboard/jobs/${jobId}/interviews/${interviewId}`);
        return;
      }

      const genRes = await fetch(`/api/interviews/${interviewId}/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionCount }),
      });
      const genData = await genRes.json();

      if (!genRes.ok) {
        // The draft interview exists even if generation failed — let the
        // recruiter add questions manually from the detail page instead of
        // losing their setup work.
        toast({
          variant: 'error',
          title: 'AI question generation failed',
          description: genData.error || 'You can add questions manually on the next screen.',
        });
        router.push(`/dashboard/jobs/${jobId}/interviews/${interviewId}`);
        return;
      }

      toast({ variant: 'success', title: 'Questions generated', description: `${genData.questions.length} questions ready to review` });
      router.push(`/dashboard/jobs/${jobId}/interviews/${interviewId}`);
    } catch {
      setStep('setup');
      setError('Network error — please check your connection and try again.');
    }
  }

  if (step === 'generating') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium">
            {interviewType === 'ADAPTIVE_VOICE' ? 'Setting up your adaptive interview…' : 'Generating interview questions…'}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {interviewType === 'ADAPTIVE_VOICE'
              ? "You'll define what the live AI interview should evaluate on the next screen."
              : `The AI is reading the job description and drafting ${questionCount} questions tailored to this role.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {error && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Interview format</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setInterviewType('STATIC')}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  interviewType === 'STATIC' ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface'
                }`}
              >
                <p className="text-sm font-semibold">Static questionnaire</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A fixed set of AI-generated questions. Candidates record a video or type an answer to each one.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setInterviewType('ADAPTIVE_VOICE')}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  interviewType === 'ADAPTIVE_VOICE' ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface'
                }`}
              >
                <p className="text-sm font-semibold">Adaptive voice interview</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A live, ~20-minute spoken conversation — the AI asks follow-up questions based on what the
                  candidate actually says.
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Interview title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {interviewType === 'STATIC' && (
              <div className="space-y-2">
                <Label htmlFor="questionCount">Number of questions</Label>
                <Select value={String(questionCount)} onValueChange={(v) => setQuestionCount(Number(v))}>
                  <SelectTrigger id="questionCount" aria-label="Number of questions">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[4, 5, 6, 7, 8, 10, 12].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} questions
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="maxAttempts">Max attempts per candidate</Label>
              <Select value={String(maxAttempts)} onValueChange={(v) => setMaxAttempts(Number(v))}>
                <SelectTrigger id="maxAttempts" aria-label="Max attempts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiresInDays">Link expires in (days)</Label>
              <Input
                id="expiresInDays"
                type="number"
                min={0}
                max={90}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave at 0 for no expiration.</p>
            </div>

            <div className="flex items-end justify-between rounded-md border border-input bg-surface px-3 py-2 shadow-xs">
              <Label htmlFor="requireCv" className="cursor-pointer">
                Require CV upload
              </Label>
              <Switch id="requireCv" checked={requireCv} onCheckedChange={setRequireCv} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
            <Button type="submit">
              <Sparkles className="h-4 w-4" />
              {interviewType === 'ADAPTIVE_VOICE' ? 'Create adaptive interview' : 'Generate questions with AI'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
