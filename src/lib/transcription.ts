/**
 * Video-answer transcription. Server-only.
 *
 * Configured via the STT_PROVIDER env var already scaffolded in
 * .env.example ("openai" | "assemblyai"). This implements "openai" (Whisper,
 * via OPENAI_API_KEY — the same key AI_PROVIDER=openai already uses) and
 * additionally "gemini" (multimodal audio understanding, via GEMINI_API_KEY
 * — the same key AI_PROVIDER=gemini already uses), since Gemini is one of
 * this app's three first-class AI providers.
 *
 * Anthropic is deliberately NOT an option here: Claude models don't accept
 * audio input, so there is no real implementation to offer — listing it
 * would mean either fabricating a transcript or silently failing, both of
 * which this module refuses to do.
 *
 * "assemblyai" is left as a documented-but-unimplemented STT_PROVIDER value:
 * AssemblyAI's API is submit-then-poll (asynchronous), which doesn't fit
 * this project's "no job queue" architecture — implementing it would mean
 * either blocking the candidate's request on a polling loop or building a
 * queue neither of which this pass introduces. Selecting it fails clearly
 * via TranscriptionConfigError rather than pretending to work.
 *
 * This is a separate module from ai-provider.ts on purpose: ai-provider.ts
 * is a text-in/JSON-out chat-completions abstraction, transcription is a
 * binary-audio-in/text-out abstraction — different request shape entirely.
 * ai-provider.ts is untouched by this file.
 */

import 'server-only';

export class TranscriptionConfigError extends Error {
  constructor(message = 'Transcription is not configured') {
    super(message);
    this.name = 'TranscriptionConfigError';
  }
}

export class TranscriptionError extends Error {
  constructor(message = 'Transcription failed') {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export type TranscriptionResult = { status: 'COMPLETED'; text: string } | { status: 'FAILED'; error: string };

/**
 * OpenAI Whisper and Gemini's inline-audio input both cap out well under
 * this project's 250MB MAX_RECORDING_BYTES (Whisper's hard limit is 25MB
 * per request; Gemini's inline-payload limit is comparable). Rather than
 * download a huge file only to have the provider reject it, callers should
 * check size against this constant first and fail clearly.
 */
export const MAX_TRANSCRIBABLE_BYTES = 24 * 1024 * 1024;

type SttProvider = 'openai' | 'gemini';

function resolveProvider(): SttProvider | null {
  const configured = process.env.STT_PROVIDER;
  if (configured === 'openai' || configured === 'gemini') return configured;
  if (configured === 'assemblyai') return null; // documented, intentionally unimplemented — see file header
  if (configured) return null; // unrecognized value — never guess

  // No explicit STT_PROVIDER: fall back to AI_PROVIDER only when it's one
  // of the two providers that can actually do this, so a deployment that's
  // already set AI_PROVIDER=openai or =gemini doesn't need a second env var
  // just to turn transcription on.
  const aiProvider = process.env.AI_PROVIDER;
  if (aiProvider === 'openai' || aiProvider === 'gemini') return aiProvider;
  return null;
}

export function isTranscriptionConfigured(): boolean {
  return resolveProvider() !== null;
}

async function transcribeWithOpenAi(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TranscriptionConfigError('OPENAI_API_KEY is not set.');
  const model = process.env.STT_MODEL || 'whisper-1';
  const ext = mimeType === 'video/mp4' ? 'mp4' : 'webm';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), `recording.${ext}`);
  form.append('model', model);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TranscriptionError(`OpenAI transcription error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  if (!text) throw new TranscriptionError('OpenAI returned an empty transcript');
  return text;
}

async function transcribeWithGemini(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TranscriptionConfigError('GEMINI_API_KEY is not set.');
  const model = process.env.STT_MODEL || 'gemini-2.0-flash';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
              {
                text: 'Transcribe the spoken audio in this recording verbatim. Respond with only the transcript text — no summary, no commentary, no formatting.',
              },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TranscriptionError(`Gemini transcription error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('').trim();
  if (!text) throw new TranscriptionError('Gemini returned an empty transcript');
  return text;
}

/**
 * Transcribes a video/audio recording. Never fabricates a transcript:
 * returns FAILED with a real reason (config missing, provider error, empty
 * result) rather than any placeholder text. Callers must not treat a
 * FAILED result as evaluable content.
 */
export async function transcribeRecording(params: { buffer: Buffer; mimeType: string }): Promise<TranscriptionResult> {
  const provider = resolveProvider();
  if (!provider) {
    return {
      status: 'FAILED',
      error: 'Transcription is not configured for this environment (set STT_PROVIDER=openai or gemini).',
    };
  }

  if (params.buffer.byteLength > MAX_TRANSCRIBABLE_BYTES) {
    return {
      status: 'FAILED',
      error: `Recording exceeds the size supported for transcription (${Math.round(MAX_TRANSCRIBABLE_BYTES / (1024 * 1024))}MB).`,
    };
  }

  try {
    const text = provider === 'openai' ? await transcribeWithOpenAi(params.buffer, params.mimeType) : await transcribeWithGemini(params.buffer, params.mimeType);
    return { status: 'COMPLETED', text };
  } catch (err) {
    console.error('[transcription] failed:', err);
    if (err instanceof TranscriptionConfigError) {
      return { status: 'FAILED', error: err.message };
    }
    return { status: 'FAILED', error: err instanceof Error ? err.message : 'Transcription failed.' };
  }
}
