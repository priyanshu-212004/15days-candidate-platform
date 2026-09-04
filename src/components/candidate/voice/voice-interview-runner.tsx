'use client';

import * as React from 'react';
import { Mic, MicOff, Clock3, AlertTriangle, Loader2, Circle, Video, VideoOff, UploadCloud, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResumeUploadPanel } from '@/components/candidate/resume-upload-panel';
import { AiInterviewerAvatar, type AvatarState } from './ai-interviewer-avatar';
import { VoiceSelectPanel, type SelectedVoice } from './voice-select-panel';
import { VOICE_PRESETS } from '@/lib/voice/voice-options';
import { useAdaptiveInterview } from './use-adaptive-interview';

const VOICE_LABELS: Record<string, string> = Object.fromEntries(VOICE_PRESETS.map((p) => [p.id, p.label]));

function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

interface ResumeGateInfo {
  requireCv: boolean;
  resume: { fileName: string; parseStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; parseError: string | null } | null;
}

/** Candidate camera panel, bound to the hook's shared recording stream — no separate getUserMedia call, so this is the same stream MediaRecorder actually captures (fixing the earlier "preview only, never recorded" gap). */
function CandidateVideoPanel({
  stream,
  deviceStatus,
  recording,
}: {
  stream: MediaStream | null;
  deviceStatus: string;
  recording: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  if (deviceStatus === 'denied' || deviceStatus === 'unavailable' || deviceStatus === 'unsupported') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-800 p-4 text-center text-sm text-slate-300">
        <VideoOff className="h-6 w-6" />
        <p>
          {deviceStatus === 'unsupported'
            ? 'Recording is not supported in this browser.'
            : deviceStatus === 'unavailable'
              ? 'No camera or microphone was found.'
              : 'Camera and microphone access was not granted.'}
        </p>
        <p className="text-xs text-slate-400">Your spoken answers will still be used via live transcription.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-slate-800">
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">You</span>
      {recording && (
        <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
          Recording
        </span>
      )}
    </div>
  );
}

const PHASE_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  ai_speaking: 'Interviewer is speaking',
  waiting_for_candidate: 'Your turn…',
  candidate_speaking: 'Listening — recording your answer',
  answer_finalizing: 'Processing your answer…',
  uploading: 'Uploading your response…',
  processing: 'Answer saved. Generating the next question…',
  ended: 'Interview complete',
  error: 'Something went wrong',
};

const VOICE_STORAGE_PREFIX = 'adaptive-interview-voice:';

export function VoiceInterviewRunner({ token }: { token: string }) {
  const [gateState, setGateState] = React.useState<'loading' | 'needs-resume' | 'needs-voice' | 'ready' | 'error'>('loading');
  const [resumeInfo, setResumeInfo] = React.useState<ResumeGateInfo | null>(null);
  // Persisted for the current interview session only (sessionStorage, keyed
  // by token) — not a durable candidate preference and not a DB migration,
  // per the task's constraints. Only the preset id survives a reload; the
  // actual SpeechSynthesisVoice object is re-resolved from it since browser
  // voice lists cannot be serialized.
  const [selectedVoice, setSelectedVoice] = React.useState<SelectedVoice | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/interviews/${token}/session`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setGateState('error');
          return;
        }
        const data: ResumeGateInfo = await res.json();
        if (cancelled) return;
        setResumeInfo(data);
        if (data.requireCv && !data.resume) {
          setGateState('needs-resume');
        } else {
          setGateState('needs-voice');
        }
      } catch {
        if (!cancelled) setGateState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleVoiceConfirmed = React.useCallback(
    (selection: SelectedVoice) => {
      try {
        window.sessionStorage.setItem(`${VOICE_STORAGE_PREFIX}${token}`, selection.presetId);
      } catch {
        // sessionStorage can throw in locked-down/private browsing contexts — never block starting the interview over it.
      }
      setSelectedVoice(selection);
      setGateState('ready');
    },
    [token]
  );

  const ready = gateState === 'ready';
  const state = useAdaptiveInterview(token, ready, selectedVoice?.voice ?? null);

  if (gateState === 'loading') {
    return (
      <div className="mx-auto flex max-w-lg justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (gateState === 'error') {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
            <p className="text-sm text-muted-foreground">We could not load your interview. Please refresh the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gateState === 'needs-resume') {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="p-6 sm:p-8">
            <ResumeUploadPanel
              token={token}
              initialResume={resumeInfo?.resume ?? null}
              onDone={() => setGateState('needs-voice')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gateState === 'needs-voice') {
    return <VoiceSelectPanel onConfirm={handleVoiceConfirmed} />;
  }

  const {
    phase,
    currentTurn,
    liveTranscript,
    errorMessage,
    degraded,
    elapsedSec,
    targetSec,
    sttSupported,
    deviceStatus,
    videoStream,
    uploadError,
    finishAnswer,
    endInterviewEarly,
    retry,
    retryUpload,
    skipRecordingAndContinue,
    tabWarning,
    tabSwitchCount,
    acknowledgeTabWarning,
  } = state;

  const aiSpeaking = phase === 'ai_speaking';
  const candidateSpeaking = phase === 'candidate_speaking';
  const canFinishAnswer = candidateSpeaking;
  const busy = phase === 'connecting' || phase === 'answer_finalizing' || phase === 'processing';
  const avatarState: AvatarState =
    phase === 'ai_speaking'
      ? 'speaking'
      : phase === 'candidate_speaking'
        ? 'listening'
        : phase === 'processing' || phase === 'answer_finalizing' || phase === 'uploading'
          ? 'processing'
          : 'idle';

  if (!sttSupported && phase !== 'error') {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-warning" />
            <h1 className="text-lg font-semibold">Browser not supported</h1>
            <p className="text-sm text-muted-foreground">
              This live voice interview needs speech recognition, which isn&apos;t available in your current
              browser. Please reopen this link in the latest Chrome or Edge.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">{errorMessage ?? 'Please try again.'}</p>
            <Button onClick={retry}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {formatClock(elapsedSec)} / ~{formatClock(targetSec)}
          </Badge>
          {currentTurn && <Badge variant="outline">Question {currentTurn.turnNumber}</Badge>}
          {currentTurn?.topic && <Badge variant="outline">{currentTurn.topic}</Badge>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={endInterviewEarly}
          disabled={phase === 'connecting' || phase === 'ended'}
        >
          End interview early
        </Button>
      </div>

      {degraded && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          We had a brief hiccup reaching the AI interviewer — your answers are safely saved and the interview is
          continuing normally.
        </div>
      )}

      {tabWarning && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning-foreground">
          <span className="flex items-center gap-2">
            <EyeOff className="h-4 w-4 shrink-0" />
            You switched away from the interview tab. Please stay on this tab for the rest of the interview.
            {tabSwitchCount > 1 && ` (${tabSwitchCount} times so far.)`}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={acknowledgeTabWarning}>
            I&apos;m back
          </Button>
        </div>
      )}

      {/* Camera occupies the majority of the workspace (~70–75%) on
          desktop/tablet; stacks full-width above the AI panel on mobile. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="relative" style={{ aspectRatio: '16 / 9' }}>
              <CandidateVideoPanel
                stream={videoStream}
                deviceStatus={deviceStatus}
                recording={candidateSpeaking && deviceStatus === 'ready'}
              />
              <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                <Clock3 className="h-3 w-3" />
                {formatClock(elapsedSec)}
              </div>
            </div>

            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {phase === 'uploading' && <UploadCloud className="h-4 w-4 animate-pulse text-primary" />}
                  {candidateSpeaking && <Mic className="h-4 w-4 text-primary" />}
                  {PHASE_LABEL[phase] ?? phase}
                </span>
                <span className="flex items-center gap-1 text-xs">
                  {deviceStatus === 'ready' ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                  {deviceStatus === 'ready' ? 'Camera on' : 'Camera unavailable'}
                </span>
                <span className="flex items-center gap-1 text-xs">
                  {sttSupported ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  {sttSupported ? 'Mic ready' : 'Mic unavailable'}
                </span>
              </div>

              <div className="min-h-[88px] rounded-lg border border-border bg-surface-sunken p-4 text-sm leading-relaxed">
                {aiSpeaking || phase === 'waiting_for_candidate' ? (
                  <p className="text-foreground">{currentTurn?.question}</p>
                ) : candidateSpeaking || phase === 'answer_finalizing' || phase === 'uploading' ? (
                  <p className={liveTranscript ? 'text-foreground' : 'italic text-muted-foreground'}>
                    {liveTranscript || 'Start speaking — your answer will appear here.'}
                  </p>
                ) : (
                  <p className="italic text-muted-foreground">…</p>
                )}
              </div>

              {uploadError && (
                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <p>{uploadError}</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={retryUpload}>
                      Retry upload
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={skipRecordingAndContinue}>
                      Continue without saving the recording
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={finishAnswer} disabled={!canFinishAnswer}>
                  Finish Answer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div style={{ aspectRatio: '4 / 5' }}>
              <AiInterviewerAvatar label="AI Interviewer" state={avatarState} />
            </div>
            {selectedVoice && (
              <div className="flex items-center justify-center gap-1.5 border-t border-border py-2 text-xs text-muted-foreground">
                <Mic className="h-3 w-3" />
                Voice: {VOICE_LABELS[selectedVoice.presetId] ?? selectedVoice.presetId}
              </div>
            )}
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{formatClock(elapsedSec)} / ~{formatClock(targetSec)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (elapsedSec / Math.max(targetSec, 1)) * 100)}%` }}
                />
              </div>
              {currentTurn?.topic && (
                <p className="text-xs text-muted-foreground">
                  Current topic: <span className="font-medium text-foreground">{currentTurn.topic}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
