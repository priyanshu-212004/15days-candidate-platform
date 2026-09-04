'use client';

// The Web Speech API's TS types aren't in lib.dom yet in this project's TS
// target — declare the minimal shape we actually use rather than pulling in
// a whole ambient-types package for one browser API.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export interface SttHandlers {
  /** Interim (not-yet-final) words — for live captions only, not persisted. */
  onInterim: (text: string) => void;
  /** A finalized chunk of speech — appended to the running transcript. */
  onFinalChunk: (text: string) => void;
  /** A genuine, non-benign recognition error (permission denied, no mic, etc). */
  onError: (error: Error) => void;
}

export interface SttController {
  readonly isSupported: boolean;
  /** Begins (or resumes) listening. Safe to call again after stop(). */
  start(handlers: SttHandlers): void;
  /** Gracefully stops listening — this is the ONLY thing that should be treated as "candidate is done", and even then only via the caller's own silence-timeout/Finish-Answer logic, not this call's onend. */
  stop(): void;
}

const BENIGN_ERRORS = new Set(['no-speech', 'aborted']);

export function createSttController(): SttController {
  const Ctor: SpeechRecognitionCtor | undefined =
    typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;
  const isSupported = !!Ctor;

  let recognition: SpeechRecognitionLike | null = null;
  let handlers: SttHandlers | null = null;
  let manuallyStopped = false;
  // Generation counter guarding against a subtle race: recognition.stop()
  // is asynchronous — its onend fires some time later. If start() is
  // called again (next turn) before that stale onend arrives, the OLD
  // instance's onend must NOT restart itself (it would create a second,
  // concurrently-running recognition instance alongside the new one).
  // Each beginRecognition() call captures the generation it belongs to and
  // only acts on its own onend/onresult/onerror if it's still current.
  let generation = 0;

  function beginRecognition(): void {
    if (!Ctor || !handlers) return;
    generation += 1;
    const myGeneration = generation;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    // Defense against a documented Chrome quirk where a final result can
    // occasionally be redelivered at the same resultIndex on a later
    // onresult event — tracking the highest index we've already committed
    // as final prevents that from duplicating text in the transcript.
    let highestFinalIndexSeen = -1;

    rec.onresult = (event) => {
      if (myGeneration !== generation) return; // stale instance — ignore
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          if (i <= highestFinalIndexSeen) continue; // already committed — skip duplicate
          highestFinalIndexSeen = i;
          finalChunk += transcript;
        } else {
          interim += transcript;
        }
      }
      if (finalChunk.trim()) handlers?.onFinalChunk(finalChunk);
      if (interim.trim()) handlers?.onInterim(interim);
    };

    rec.onerror = (event) => {
      if (myGeneration !== generation) return;
      if (BENIGN_ERRORS.has(event.error)) {
        // Not a real failure — the engine will fire onend next, which we
        // handle by restarting (see below). Never surfaced to the caller.
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        handlers?.onError(new Error('Microphone permission was denied for speech recognition.'));
        return;
      }
      if (event.error === 'audio-capture') {
        handlers?.onError(new Error('No microphone could be found on this device.'));
        return;
      }
      if (event.error === 'network') {
        handlers?.onError(new Error('Speech recognition lost its network connection.'));
        return;
      }
      handlers?.onError(new Error(`Speech recognition error: ${event.error}`));
    };

    // IMPORTANT: onend does NOT mean "the candidate finished speaking." Many
    // browsers stop continuous recognition on their own after a period of
    // silence, or in short bursts, well before the candidate is actually
    // done. If we didn't ask for this stop, just restart listening — the
    // caller's own silence-timeout timer and "Finish Answer" button are the
    // only two things allowed to decide the candidate is finished.
    rec.onend = () => {
      if (myGeneration !== generation) return; // superseded by a newer start() — do not restart
      if (manuallyStopped) return;
      try {
        beginRecognition();
      } catch (err) {
        handlers?.onError(err instanceof Error ? err : new Error('Failed to restart speech recognition'));
      }
    };

    recognition = rec;
    rec.start();
  }

  function start(h: SttHandlers): void {
    if (!isSupported) {
      h.onError(new Error('Speech recognition is not supported in this browser.'));
      return;
    }
    // Guard against being called again while an instance is already
    // running (e.g. a double-invoked effect) — stop the old one first so
    // there is never more than one recognition instance active.
    if (recognition && !manuallyStopped) {
      manuallyStopped = true;
      generation += 1; // invalidate the old instance's onend before it can restart itself
      recognition.abort();
      recognition = null;
    }
    handlers = h;
    manuallyStopped = false;
    beginRecognition();
  }

  function stop(): void {
    manuallyStopped = true;
    generation += 1; // any in-flight onend from this instance is now stale and won't restart
    recognition?.stop();
    recognition = null;
  }

  return { isSupported, start, stop };
}
