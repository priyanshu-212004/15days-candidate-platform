'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createTtsController } from '@/lib/voice/tts';
import { createSttController } from '@/lib/voice/stt';
import { createRecordingController, PICKED_RECORDING_BASE_MIME_TYPE } from '@/lib/voice/recorder';
import type { VoicePhase, DeviceStatus, CurrentTurn } from './types';

/**
 * How long the candidate can go without any new speech (interim or final)
 * before we treat the answer as finished and move on. This is the ONLY
 * automatic trigger for CANDIDATE_SPEAKING -> ANSWER_FINALIZING besides the
 * explicit "Finish Answer" button — the underlying STT engine's own onend
 * event is deliberately never used for this (see lib/voice/stt.ts).
 */
/** A mutable ref's `.current` can change between statements (especially across `await`), but TypeScript's control-flow narrowing doesn't know that and can incorrectly persist an earlier guard's narrowed type onto later reads of the same expression. Routing the check through a plain function call — where the parameter has its own, unnarrowed declared type — sidesteps that entirely. */
function isTerminalPhase(p: VoicePhase): boolean {
  return p === 'ended' || p === 'error';
}

const SILENCE_TIMEOUT_MS = 3000;

/** Safety net in case TTS never fires onend (rare browser bug) — captions still show the question either way. */
const TTS_WATCHDOG_MS = 15000;

export interface AdaptiveInterviewState {
  phase: VoicePhase;
  currentTurn: CurrentTurn | null;
  liveTranscript: string;
  errorMessage: string | null;
  degraded: boolean;
  elapsedSec: number;
  targetSec: number;
  maxSec: number;
  sttSupported: boolean;
  ttsSupported: boolean;
  recordingSupported: boolean;
  deviceStatus: DeviceStatus;
  videoStream: MediaStream | null;
  /** Set only while `phase === 'uploading'` failed and is awaiting the candidate's choice — never auto-discarded. */
  uploadError: string | null;
  finishAnswer: () => void;
  endInterviewEarly: () => void;
  retry: () => void;
  retryUpload: () => void;
  skipRecordingAndContinue: () => void;
  /** True while the candidate has switched tabs / lost focus and hasn't acknowledged the warning yet. Recording, STT, and the camera are never stopped because of this — see `acknowledgeTabWarning`. */
  tabWarning: boolean;
  /** How many times the candidate has left the tab this session (client-side only — not persisted, see hook docs). */
  tabSwitchCount: number;
  /** Dismisses the current tab-switch warning banner. */
  acknowledgeTabWarning: () => void;
}

/**
 * `ready` gates the whole session — the hook does nothing (no camera
 * request, no /adaptive/start call) until the caller sets this to true.
 * The candidate-facing component uses this to hold off starting until any
 * required resume upload is done, mirroring the STATIC flow's resume gate.
 */
export function useAdaptiveInterview(
  token: string,
  ready: boolean,
  voice?: SpeechSynthesisVoice | null
): AdaptiveInterviewState {
  const router = useRouter();

  const [phase, setPhase] = React.useState<VoicePhase>('connecting');
  const [currentTurn, setCurrentTurn] = React.useState<CurrentTurn | null>(null);
  const [liveTranscript, setLiveTranscript] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [degraded, setDegraded] = React.useState(false);
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [targetSec, setTargetSec] = React.useState(20 * 60);
  const [maxSec, setMaxSec] = React.useState(22 * 60);
  const [deviceStatus, setDeviceStatus] = React.useState<DeviceStatus>('idle');
  const [videoStream, setVideoStream] = React.useState<MediaStream | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [tabWarning, setTabWarning] = React.useState(false);
  const [tabSwitchCount, setTabSwitchCount] = React.useState(0);

  const ttsRef = React.useRef(createTtsController());
  const sttRef = React.useRef(createSttController());
  const recorderRef = React.useRef(createRecordingController());
  const silenceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = React.useRef('');
  const clockStartRef = React.useRef<number>(Date.now());
  const phaseRef = React.useRef<VoicePhase>('connecting');
  const endingRef = React.useRef(false);
  const currentTurnRef = React.useRef<CurrentTurn | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  // Holds a recorded-but-not-yet-uploaded answer so retryUpload/
  // skipRecordingAndContinue can act on it without re-recording.
  const pendingUploadRef = React.useRef<{ blob: Blob; durationSec: number; turnId: string; answerText: string } | null>(
    null
  );
  const voiceRef = React.useRef<SpeechSynthesisVoice | null>(voice ?? null);
  // Pauses the silence-timeout timer while the candidate's tab is hidden so
  // a tab switch alone can never masquerade as candidate silence and
  // auto-finalize their answer (resumed once they come back — see the
  // tab-integrity effect below).
  const silencePausedRef = React.useRef(false);

  phaseRef.current = phase;
  voiceRef.current = voice ?? null;

  // ---------------------------------------------------------------------
  // Low-level helpers, declared before anything that depends on them.
  // ---------------------------------------------------------------------

  const clearSilenceTimer = React.useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopListening = React.useCallback(() => {
    clearSilenceTimer();
    sttRef.current.stop();
  }, [clearSilenceTimer]);

  const finishToCompleteScreen = React.useCallback(() => {
    ttsRef.current.cancel();
    stopListening();
    recorderRef.current.releaseStream(streamRef.current);
    streamRef.current = null;
    setPhase('ended');
    router.push(`/interview/${token}/complete`);
  }, [router, stopListening, token]);

  const endInterviewInternal = React.useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    ttsRef.current.cancel();
    stopListening();
    clearSilenceTimer();
    setPhase('processing');
    try {
      const res = await fetch(`/api/public/interviews/${token}/adaptive/finish`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to finish the interview');
      }
    } catch (err) {
      console.error('[voice-interview] finish failed:', err);
    } finally {
      finishToCompleteScreen();
    }
  }, [token, stopListening, clearSilenceTimer, finishToCompleteScreen]);

  // ---- Elapsed-time clock (client-side UX only — the server independently
  // enforces the real max duration on every turn submission). ----
  React.useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - clockStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [ready]);

  React.useEffect(() => {
    if (elapsedSec >= maxSec && phaseRef.current !== 'ended' && phaseRef.current !== 'error' && !endingRef.current) {
      void endInterviewInternal();
    }
  }, [elapsedSec, maxSec, endInterviewInternal]);

  const resetSilenceTimer = React.useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      finalizeAnswerRef.current?.();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  const beginListening = React.useCallback(() => {
    setPhase('candidate_speaking');
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    resetSilenceTimer();

    // Start the video/audio recording for this turn on the already-granted
    // camera stream (requested once at session start, reused per turn) —
    // this is what was missing before: the webcam was preview-only and
    // nothing was ever recorded or uploaded.
    if (streamRef.current) {
      recorderRef.current.startRecording(streamRef.current);
    }

    sttRef.current.start({
      onInterim: (text) => {
        setLiveTranscript((finalTranscriptRef.current + ' ' + text).trim());
        resetSilenceTimer();
      },
      onFinalChunk: (text) => {
        finalTranscriptRef.current = (finalTranscriptRef.current + ' ' + text).trim();
        setLiveTranscript(finalTranscriptRef.current);
        resetSilenceTimer();
      },
      onError: (err) => {
        console.error('[voice-interview] STT error:', err);
        // Speech recognition failing does not have to end the interview if
        // a video recording is still being captured — the video's own
        // server-side transcription can serve as a fallback (see
        // adaptive/recordings/[turnId]/complete). Only hard-stop if we
        // also have no recording to fall back on.
        if (!streamRef.current) {
          setErrorMessage(
            err.message.includes('not supported')
              ? 'Your browser does not support speech recognition. Please use the latest Chrome or Edge.'
              : err.message
          );
          setPhase('error');
        } else {
          console.warn('[voice-interview] continuing on recording-only fallback after STT error:', err.message);
        }
      },
    });
  }, [resetSilenceTimer]);

  const speakQuestion = React.useCallback(async (turn: CurrentTurn) => {
    setCurrentTurn(turn);
    currentTurnRef.current = turn;
    setLiveTranscript('');
    finalTranscriptRef.current = '';
    setPhase('ai_speaking');

    let watchdog: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        ttsRef.current.speak(turn.question, { voice: voiceRef.current }),
        new Promise<void>((resolve) => {
          watchdog = setTimeout(resolve, TTS_WATCHDOG_MS);
        }),
      ]);
    } catch (err) {
      console.error('[voice-interview] TTS failed, continuing with captions only:', err);
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }

    if (isTerminalPhase(phaseRef.current)) return;
    setPhase('waiting_for_candidate');

    await new Promise((resolve) => setTimeout(resolve, 400));
    if (isTerminalPhase(phaseRef.current)) return;

    beginListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Uploads a recorded answer for the given turn. Never throws — always returns a result the caller can act on. */
  const uploadRecording = React.useCallback(
    async (blob: Blob, durationSec: number, turnId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const urlRes = await fetch(`/api/public/interviews/${token}/adaptive/recordings/${turnId}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType: PICKED_RECORDING_BASE_MIME_TYPE, sizeBytes: blob.size }),
        });
        if (!urlRes.ok) {
          const data = await urlRes.json().catch(() => null);
          // 501 = recording storage isn't configured in this environment —
          // not a real failure the candidate caused, so continue silently
          // on the transcript alone rather than blocking them.
          if (urlRes.status === 501) return { ok: true };
          return { ok: false, error: data?.error ?? 'Could not start the upload.' };
        }
        const { url, key } = await urlRes.json();

        const putRes = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': PICKED_RECORDING_BASE_MIME_TYPE },
          body: blob,
        });
        if (!putRes.ok) return { ok: false, error: 'The upload did not complete. Please try again.' };

        const completeRes = await fetch(`/api/public/interviews/${token}/adaptive/recordings/${turnId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storageKey: key, durationSec }),
        });
        if (!completeRes.ok) {
          const data = await completeRes.json().catch(() => null);
          return { ok: false, error: data?.error ?? 'We could not confirm the upload finished.' };
        }
        return { ok: true };
      } catch (err) {
        console.error('[voice-interview] recording upload failed:', err);
        return { ok: false, error: 'Network error while uploading your recording.' };
      }
    },
    [token]
  );

  /** Submits the answer text to the adaptive turn engine and advances to the next question (or ends). Assumes any recording has already been handled. */
  const submitTurn = React.useCallback(
    async (turnId: string, answerText: string) => {
      setPhase('processing');
      try {
        const res = await fetch(`/api/public/interviews/${token}/adaptive/turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnId, answerText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to process your answer');

        if (data.degraded) setDegraded(true);

        if (data.sessionStatus === 'COMPLETED' || !data.turn) {
          finishToCompleteScreen();
          return;
        }
        void speakQuestion(data.turn);
      } catch (err) {
        console.error('[voice-interview] turn submission failed:', err);
        setErrorMessage(
          err instanceof Error ? err.message : 'Something went wrong processing your answer. Please try again.'
        );
        setPhase('error');
      }
    },
    [token, finishToCompleteScreen, speakQuestion]
  );

  const finalizeAnswer = React.useCallback(async () => {
    if (phaseRef.current !== 'candidate_speaking') return;
    clearSilenceTimer();
    setPhase('answer_finalizing');
    stopListening();

    const answerText = finalTranscriptRef.current.trim();
    const turn = currentTurnRef.current;
    if (!turn) return;

    const recording = await recorderRef.current.stopRecording();

    if (!answerText && !recording) {
      // Nothing was said and nothing was recorded — give the candidate
      // another chance rather than submitting a truly empty answer.
      beginListening();
      return;
    }

    // The transcript is submitted even if it's empty when a recording
    // exists — the video's own server-side transcription can still
    // produce an answer later, and we must never block indefinitely on a
    // browser-STT hiccup when audio/video was successfully captured.
    if (!recording) {
      await submitTurn(turn.id, answerText || '(no speech detected)');
      return;
    }

    setPhase('uploading');
    setUploadError(null);
    const result = await uploadRecording(recording.blob, recording.durationSec, turn.id);
    if (!result.ok) {
      // Never discard the recording or the transcript — keep both so the
      // candidate can retry, and don't advance to the next question until
      // it's resolved one way or the other.
      pendingUploadRef.current = { blob: recording.blob, durationSec: recording.durationSec, turnId: turn.id, answerText };
      setUploadError(result.error ?? 'Upload failed.');
      return;
    }

    await submitTurn(turn.id, answerText || '(no speech detected)');
  }, [clearSilenceTimer, stopListening, beginListening, uploadRecording, submitTurn]);

  // Populated right after finalizeAnswer is declared — resetSilenceTimer's
  // setTimeout callback (defined earlier) reads through this ref so it
  // always calls the current version.
  const finalizeAnswerRef = React.useRef<(() => void) | null>(null);
  finalizeAnswerRef.current = () => void finalizeAnswer();

  const retryUpload = React.useCallback(() => {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    setUploadError(null);
    setPhase('uploading');
    void (async () => {
      const result = await uploadRecording(pending.blob, pending.durationSec, pending.turnId);
      if (!result.ok) {
        setUploadError(result.error ?? 'Upload failed.');
        return;
      }
      pendingUploadRef.current = null;
      await submitTurn(pending.turnId, pending.answerText || '(no speech detected)');
    })();
  }, [uploadRecording, submitTurn]);

  /** Explicit escape hatch, per design: the candidate (or the app) may choose to proceed on the transcript alone rather than being blocked forever by a storage outage. Never triggered automatically. */
  const skipRecordingAndContinue = React.useCallback(() => {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    pendingUploadRef.current = null;
    setUploadError(null);
    void submitTurn(pending.turnId, pending.answerText || '(no speech detected)');
  }, [submitTurn]);

  const startSession = React.useCallback(async () => {
    setPhase('connecting');
    setErrorMessage(null);

    // Camera/mic are requested once per session (not per turn) so the
    // preview + recording pipeline is ready before the first question.
    // A denial/failure here degrades to transcript-only rather than
    // blocking the interview — the existing working flow must keep working
    // even without camera access.
    if (recorderRef.current.isSupported) {
      setDeviceStatus('requesting');
      try {
        const stream = await recorderRef.current.requestStream();
        streamRef.current = stream;
        setVideoStream(stream);
        setDeviceStatus('ready');
      } catch (err) {
        const name = (err as DOMException)?.name;
        setDeviceStatus(
          name === 'NotAllowedError' || name === 'PermissionDeniedError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'DevicesNotFoundError'
              ? 'unavailable'
              : 'denied'
        );
      }
    } else {
      setDeviceStatus('unsupported');
    }

    try {
      const res = await fetch(`/api/public/interviews/${token}/adaptive/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to start the interview');

      if (data.sessionStatus === 'COMPLETED' || !data.turn) {
        finishToCompleteScreen();
        return;
      }

      setTargetSec(data.targetSec ?? 20 * 60);
      setMaxSec(data.maxSec ?? 22 * 60);
      clockStartRef.current = Date.now() - (data.elapsedSec ?? 0) * 1000;
      if (data.degraded) setDegraded(true);

      void speakQuestion(data.turn);
    } catch (err) {
      console.error('[voice-interview] failed to start:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start the interview.');
      setPhase('error');
    }
  }, [token, speakQuestion, finishToCompleteScreen]);

  React.useEffect(() => {
    if (!ready) return;
    void startSession();
    const tts = ttsRef.current;
    const stt = sttRef.current;
    const recorder = recorderRef.current;
    return () => {
      tts.cancel();
      stt.stop();
      clearSilenceTimer();
      recorder.releaseStream(streamRef.current);
      streamRef.current = null;
    };
    // Runs once when `ready` first becomes true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ---------------------------------------------------------------------
  // Interview integrity: detect the candidate leaving the tab/window.
  // A normal browser page cannot actually prevent tab switching, so this is
  // detection + warning only — it never stops the camera, recorder, or STT,
  // and it never finalizes the answer by itself. The only side effect on
  // the recording/STT pipeline is pausing the silence-timeout clock while
  // hidden, so the time the candidate spent away is never misread as them
  // going quiet mid-answer.
  // ---------------------------------------------------------------------
  React.useEffect(() => {
    if (!ready) return;

    function handleLeave() {
      if (isTerminalPhase(phaseRef.current)) return;
      if (phaseRef.current === 'candidate_speaking' && !silencePausedRef.current) {
        silencePausedRef.current = true;
        clearSilenceTimer();
      }
      setTabSwitchCount((count) => count + 1);
      setTabWarning(true);
    }

    function handleReturn() {
      if (silencePausedRef.current) {
        silencePausedRef.current = false;
        if (phaseRef.current === 'candidate_speaking') resetSilenceTimer();
      }
    }

    function onVisibilityChange() {
      if (document.hidden) handleLeave();
      else handleReturn();
    }
    function onBlur() {
      // Secondary signal for cases visibilitychange misses (e.g. some
      // browsers when switching to another application rather than tab).
      if (!document.hidden) handleLeave();
    }
    function onFocus() {
      if (!document.hidden) handleReturn();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [ready, clearSilenceTimer, resetSilenceTimer]);

  const acknowledgeTabWarning = React.useCallback(() => setTabWarning(false), []);

  const finishAnswer = React.useCallback(() => {
    void finalizeAnswer();
  }, [finalizeAnswer]);

  const endInterviewEarly = React.useCallback(() => {
    void endInterviewInternal();
  }, [endInterviewInternal]);

  const retryFromError = React.useCallback(() => {
    endingRef.current = false;
    void startSession();
  }, [startSession]);

  return {
    phase,
    currentTurn,
    liveTranscript,
    errorMessage,
    degraded,
    elapsedSec,
    targetSec,
    maxSec,
    sttSupported: sttRef.current.isSupported,
    ttsSupported: ttsRef.current.isSupported,
    recordingSupported: recorderRef.current.isSupported,
    deviceStatus,
    videoStream,
    uploadError,
    finishAnswer,
    endInterviewEarly,
    retry: retryFromError,
    retryUpload,
    skipRecordingAndContinue,
    tabWarning,
    tabSwitchCount,
    acknowledgeTabWarning,
  };
}
