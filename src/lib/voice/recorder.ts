'use client';

/**
 * Picks the best-supported recording MIME type for MediaRecorder. Mirrors
 * the same detection RecordingPanel uses for the STATIC flow, kept here so
 * both call sites resolve to the identical, tested-compatible format
 * instead of duplicating the codec-sniffing logic.
 */
export const PICKED_RECORDING_MIME_TYPE =
  typeof window !== 'undefined' && window.MediaRecorder?.isTypeSupported?.('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

// noUncheckedIndexedAccess makes split()[0] technically optional even
// though it's always present — same rationale as RecordingPanel's identical
// fallback.
export const PICKED_RECORDING_BASE_MIME_TYPE = PICKED_RECORDING_MIME_TYPE.split(';')[0] ?? PICKED_RECORDING_MIME_TYPE;

export interface RecordingController {
  readonly isSupported: boolean;
  /** Requests camera+mic and returns the live stream (also usable directly as a <video> srcObject for local preview). Throws a DOMException-shaped error on denial/no-device. */
  requestStream(): Promise<MediaStream>;
  /** Starts recording the given stream. No-op (returns false) if a recording is already in progress. */
  startRecording(stream: MediaStream): boolean;
  /** Stops the current recording and resolves with the finalized Blob once MediaRecorder actually flushes it — never a synchronous/optimistic result. Resolves null if nothing was recording. */
  stopRecording(): Promise<{ blob: Blob; durationSec: number } | null>;
  /** Stops all tracks on a stream (camera light off, mic released). */
  releaseStream(stream: MediaStream | null): void;
}

export function createRecordingController(): RecordingController {
  const isSupported =
    typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.MediaRecorder;

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;

  async function requestStream(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }

  function startRecording(stream: MediaStream): boolean {
    if (!isSupported || recorder) return false;
    chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: PICKED_RECORDING_MIME_TYPE });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder = rec;
    startedAt = Date.now();
    rec.start();
    return true;
  }

  function stopRecording(): Promise<{ blob: Blob; durationSec: number } | null> {
    const rec = recorder;
    if (!rec) return Promise.resolve(null);
    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: PICKED_RECORDING_MIME_TYPE });
        chunks = [];
        recorder = null;
        resolve({ blob, durationSec });
      };
      // MediaRecorder throws if stop() is called on an already-inactive
      // recorder (e.g. the track ended on its own) — treat that the same
      // as a clean stop rather than letting it throw into the caller.
      try {
        rec.stop();
      } catch {
        recorder = null;
        resolve(null);
      }
    });
  }

  function releaseStream(stream: MediaStream | null): void {
    stream?.getTracks().forEach((t) => t.stop());
  }

  return { isSupported, requestStream, startRecording, stopRecording, releaseStream };
}
