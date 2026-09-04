'use client';

/**
 * Thin wrapper around the browser's SpeechSynthesis API. Kept behind this
 * interface (not called directly from components) so a cloud TTS provider
 * (OpenAI/ElevenLabs/etc) can be swapped in later without touching
 * VoiceInterviewRunner or the state machine — only this file would change.
 */
export interface SpeakOptions {
  /** A specific browser voice to use (from `voice-options.ts`). Falls back to the engine default when omitted or unavailable. */
  voice?: SpeechSynthesisVoice | null;
  /** Called as soon as the engine actually starts producing audio — used to drive "speaking" animation state precisely, not just optimistically on call. */
  onStart?: () => void;
}

export interface TtsController {
  readonly isSupported: boolean;
  /** Speaks the text; resolves when speech genuinely finishes (the `end` event), rejects on a real synthesis error. */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  /** Stops any in-progress speech immediately (e.g. candidate interrupts, or we're tearing down). */
  cancel(): void;
}

export function createTtsController(): TtsController {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  function cancel(): void {
    if (isSupported) window.speechSynthesis.cancel();
  }

  function speak(text: string, options?: SpeakOptions): Promise<void> {
    if (!isSupported) {
      // No TTS available in this browser — resolve immediately so the state
      // machine still advances (captions alone carry the question).
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      // Some browsers (notably Chrome) silently drop queued utterances if
      // speak() is called while the engine is still finishing a previous
      // one — always cancel first so every question is spoken reliably.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (options?.voice) {
        utterance.voice = options.voice;
        // Setting lang explicitly (not just voice) avoids some engines
        // silently reverting to a default system voice/accent.
        utterance.lang = options.voice.lang;
      }

      let settled = false;
      utterance.onstart = () => {
        options?.onStart?.();
      };
      utterance.onend = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      utterance.onerror = (event) => {
        if (settled) return;
        settled = true;
        reject(new Error(`Speech synthesis failed: ${event.error}`));
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  return { isSupported, speak, cancel };
}
