'use client';

import * as React from 'react';
import { Camera, Mic, MicOff, Circle, Square, RotateCcw, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PanelState =
  | 'idle'
  | 'requesting'
  | 'denied'
  | 'unsupported'
  | 'device-unavailable'
  | 'ready'
  | 'recording'
  | 'recorded'
  | 'uploading'
  | 'upload-error'
  | 'uploaded';

interface Props {
  token: string;
  questionId: string;
  expectedDurationSec: number;
  hasExistingRecording: boolean;
  onUploaded: (durationSec: number) => void;
}

const PICKED_MIME_TYPE =
  typeof window !== 'undefined' && window.MediaRecorder?.isTypeSupported?.('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

// `String.prototype.split` is typed as returning `(string | undefined)[]`
// under `noUncheckedIndexedAccess`, even though splitting always yields at
// least one element. The `?? PICKED_MIME_TYPE` fallback is unreachable at
// runtime (there's always a [0] element) — it exists purely to satisfy the
// compiler without an `as`/`!` assertion, and keeps the two call sites below
// guaranteed to send the same base MIME type.
const PICKED_MIME_BASE_TYPE = PICKED_MIME_TYPE.split(';')[0] ?? PICKED_MIME_TYPE;

export function RecordingPanel({ token, questionId, expectedDurationSec, hasExistingRecording, onUploaded }: Props) {
  const [state, setState] = React.useState<PanelState>(hasExistingRecording ? 'uploaded' : 'idle');
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const blobRef = React.useRef<Blob | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const [previewUrl, setPreviewUrlState] = React.useState<string | null>(null);

  const setPreviewUrl = React.useCallback((next: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next;
    setPreviewUrlState(next);
  }, []);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationSec = Math.min(600, Math.max(120, expectedDurationSec * 3));

  const stopTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  React.useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [stopTimer, stopStream]);

  async function requestPermission() {
    setErrorMessage(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setState('unsupported');
      return;
    }

    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState('ready');
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') setState('denied');
      else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') setState('device-unavailable');
      else setState('denied');
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: PICKED_MIME_TYPE });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      blobRef.current = new Blob(chunksRef.current, { type: PICKED_MIME_TYPE });
      setPreviewUrl(URL.createObjectURL(blobRef.current));
      setState('recorded');
      stopTimer();
    };
    recorderRef.current = recorder;
    recorder.start();
    setElapsedSec(0);
    setState('recording');

    timerRef.current = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 1;
        if (next >= maxDurationSec) stopRecording();
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    stopStream();
  }

  function retake() {
    blobRef.current = null;
    chunksRef.current = [];
    setPreviewUrl(null);
    setUploadProgress(0);
    setErrorMessage(null);
    void requestPermission();
  }

  async function upload() {
    const blob = blobRef.current;
    if (!blob) return;

    setState('uploading');
    setUploadProgress(0);
    setErrorMessage(null);

    try {
      const urlRes = await fetch(`/api/public/interviews/${token}/recordings/${questionId}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: PICKED_MIME_BASE_TYPE, sizeBytes: blob.size }),
      });

      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not start the upload.');
      }
      const { url, key } = await urlRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', PICKED_MIME_BASE_TYPE);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
        xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
        xhr.send(blob);
      });

      const completeRes = await fetch(`/api/public/interviews/${token}/recordings/${questionId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey: key, durationSec: elapsedSec }),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json().catch(() => null);
        throw new Error(data?.error ?? 'We could not confirm the upload finished.');
      }

      setState('uploaded');
      onUploaded(elapsedSec);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed.');
      setState('upload-error');
    }
  }

  if (state === 'unsupported') {
    return (
      <PanelMessage
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Recording isn't supported in this browser"
        description="Please switch to a recent version of Chrome, Firefox, Edge, or Safari, or answer in writing instead."
      />
    );
  }

  if (state === 'denied') {
    return (
      <PanelMessage
        icon={<MicOff className="h-5 w-5" />}
        title="Camera and microphone access needed"
        description="You blocked or dismissed the permission request. Allow camera and microphone access in your browser's site settings, then try again — or answer in writing instead."
        action={{ label: 'Try again', onClick: requestPermission }}
      />
    );
  }

  if (state === 'device-unavailable') {
    return (
      <PanelMessage
        icon={<AlertTriangle className="h-5 w-5" />}
        title="No camera or microphone found"
        description="We couldn't detect a working camera or microphone on this device. You can answer in writing instead."
      />
    );
  }

  if (state === 'uploaded') {
    return (
      <PanelMessage
        icon={<CheckCircle2 className="h-5 w-5 text-success" />}
        title="Recording saved"
        description="You can record again to replace it, or move to the next question."
        action={{ label: 'Record again', onClick: retake }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black">
        {(state === 'ready' || state === 'recording') && (
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        )}
        {state === 'recorded' && previewUrl && (
          <video src={previewUrl} controls playsInline className="h-full w-full object-cover" />
        )}
        {(state === 'idle' || state === 'requesting') && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <p className="text-xs">Camera preview will appear here</p>
          </div>
        )}
        {state === 'recording' && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
            <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
            {formatTime(elapsedSec)}
          </div>
        )}
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center gap-2">
        {state === 'idle' && (
          <Button type="button" onClick={requestPermission} className="gap-2">
            <Mic className="h-4 w-4" /> Enable camera & microphone
          </Button>
        )}
        {state === 'requesting' && (
          <Button type="button" disabled className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Requesting access…
          </Button>
        )}
        {state === 'ready' && (
          <Button type="button" onClick={startRecording} className="gap-2">
            <Circle className="h-3.5 w-3.5 fill-current" /> Start recording
          </Button>
        )}
        {state === 'recording' && (
          <Button type="button" variant="destructive" onClick={stopRecording} className="gap-2">
            <Square className="h-3.5 w-3.5 fill-current" /> Stop recording
          </Button>
        )}
        {state === 'recorded' && (
          <>
            <Button type="button" onClick={upload} className="gap-2">
              Use this recording
            </Button>
            <Button type="button" variant="outline" onClick={retake} className="gap-2">
              <RotateCcw className="h-3.5 w-3.5" /> Retake
            </Button>
          </>
        )}
        {state === 'uploading' && (
          <div className="flex w-full items-center gap-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <div className="h-1.5 w-full max-w-xs rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{uploadProgress}%</span>
          </div>
        )}
        {state === 'upload-error' && (
          <Button type="button" onClick={upload} variant="outline" className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" /> Retry upload
          </Button>
        )}
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PanelMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center')}>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && (
        <Button type="button" size="sm" variant="outline" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  );
}
