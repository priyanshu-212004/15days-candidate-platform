// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSttController } from './stt';

// A minimal, controllable fake of the browser SpeechRecognition API. Each
// instance records itself in `instances` so tests can assert on how many
// concurrently-"live" (non-manually-stopped) instances ever existed, and
// can drive onresult/onerror/onend by hand.
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.stopped = true;
  }

  /** Test helper: simulate the browser delivering a result. */
  fireResult(results: { transcript: string; isFinal: boolean }[], resultIndex = 0) {
    this.onresult?.({
      resultIndex,
      results: Object.assign(
        results.map((r) => ({ isFinal: r.isFinal, 0: { transcript: r.transcript }, length: 1 })),
        { length: results.length }
      ),
    });
  }

  /** Test helper: simulate the engine stopping on its own (not via our stop()/abort()). */
  fireSpontaneousEnd() {
    this.onend?.();
  }
}

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
});

describe('createSttController — race conditions', () => {
  it('restarts automatically when the engine ends on its own (not a candidate-finished signal)', () => {
    const controller = createSttController();
    const onFinalChunk = vi.fn();
    controller.start({ onInterim: vi.fn(), onFinalChunk, onError: vi.fn() });

    expect(FakeRecognition.instances).toHaveLength(1);
    FakeRecognition.instances[0]!.fireSpontaneousEnd();

    // A new instance should have been created to keep listening.
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(FakeRecognition.instances[1]!.started).toBe(true);
  });

  it('does NOT restart when stop() was called deliberately, even if onend fires late', () => {
    const controller = createSttController();
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError: vi.fn() });
    controller.stop();

    // Simulate the stopped instance's onend arriving asynchronously afterward.
    FakeRecognition.instances[0]!.fireSpontaneousEnd();

    expect(FakeRecognition.instances).toHaveLength(1); // no restart happened
  });

  it('never has two concurrently-active instances when start() is called again quickly (double-invoke guard)', () => {
    const controller = createSttController();
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError: vi.fn() });
    const first = FakeRecognition.instances[0]!;
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError: vi.fn() });

    expect(first.stopped).toBe(true); // the old instance was aborted
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('a stale instance from before stop()+restart cannot resurrect itself via a delayed onend', () => {
    const controller = createSttController();
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError: vi.fn() });
    const stale = FakeRecognition.instances[0]!;

    controller.stop();
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError: vi.fn() });
    expect(FakeRecognition.instances).toHaveLength(2);

    // The very first (now stale) instance's onend arrives late.
    stale.fireSpontaneousEnd();

    // Must NOT have spawned a third instance — that would mean two
    // recognition instances running concurrently.
    expect(FakeRecognition.instances).toHaveLength(2);
  });
});

describe('createSttController — transcript integrity', () => {
  it('delivers a final chunk to onFinalChunk', () => {
    const controller = createSttController();
    const onFinalChunk = vi.fn();
    controller.start({ onInterim: vi.fn(), onFinalChunk, onError: vi.fn() });

    FakeRecognition.instances[0]!.fireResult([{ transcript: 'hello world', isFinal: true }], 0);

    expect(onFinalChunk).toHaveBeenCalledWith('hello world');
  });

  it('does not redeliver the same final result index twice (defends against a known browser redelivery quirk)', () => {
    const controller = createSttController();
    const onFinalChunk = vi.fn();
    controller.start({ onInterim: vi.fn(), onFinalChunk, onError: vi.fn() });

    const rec = FakeRecognition.instances[0]!;
    rec.fireResult([{ transcript: 'hello', isFinal: true }], 0);
    // Simulate the same index being redelivered on a subsequent event.
    rec.fireResult([{ transcript: 'hello', isFinal: true }], 0);

    expect(onFinalChunk).toHaveBeenCalledTimes(1);
  });

  it('ignores benign errors (no-speech, aborted) without calling onError', () => {
    const controller = createSttController();
    const onError = vi.fn();
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError });

    FakeRecognition.instances[0]!.onerror?.({ error: 'no-speech' });
    FakeRecognition.instances[0]!.onerror?.({ error: 'aborted' });

    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces a clear message for permission-denied errors', () => {
    const controller = createSttController();
    const onError = vi.fn();
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError });

    FakeRecognition.instances[0]!.onerror?.({ error: 'not-allowed' });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toMatch(/permission/i);
  });

  it('surfaces a clear message for no-microphone errors', () => {
    const controller = createSttController();
    const onError = vi.fn();
    controller.start({ onInterim: vi.fn(), onFinalChunk: vi.fn(), onError });

    FakeRecognition.instances[0]!.onerror?.({ error: 'audio-capture' });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toMatch(/microphone/i);
  });
});
