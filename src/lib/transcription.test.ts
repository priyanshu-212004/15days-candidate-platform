import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

import { transcribeRecording, isTranscriptionConfigured, MAX_TRANSCRIBABLE_BYTES } from './transcription';

describe('isTranscriptionConfigured / provider resolution', () => {
  it('is false when neither STT_PROVIDER nor a compatible AI_PROVIDER is set', () => {
    delete process.env.STT_PROVIDER;
    delete process.env.AI_PROVIDER;
    expect(isTranscriptionConfigured()).toBe(false);
  });

  it('falls back to AI_PROVIDER when STT_PROVIDER is unset and AI_PROVIDER is openai or gemini', () => {
    delete process.env.STT_PROVIDER;
    process.env.AI_PROVIDER = 'gemini';
    expect(isTranscriptionConfigured()).toBe(true);
  });

  it('is false when AI_PROVIDER is anthropic and STT_PROVIDER is unset (Claude has no audio input)', () => {
    delete process.env.STT_PROVIDER;
    process.env.AI_PROVIDER = 'anthropic';
    expect(isTranscriptionConfigured()).toBe(false);
  });

  it('is false for the documented-but-unimplemented "assemblyai" value, never silently falling back', () => {
    process.env.STT_PROVIDER = 'assemblyai';
    process.env.AI_PROVIDER = 'openai';
    expect(isTranscriptionConfigured()).toBe(false);
  });

  it('explicit STT_PROVIDER takes precedence over AI_PROVIDER', () => {
    process.env.STT_PROVIDER = 'openai';
    process.env.AI_PROVIDER = 'anthropic';
    expect(isTranscriptionConfigured()).toBe(true);
  });
});

describe('transcribeRecording — not configured', () => {
  it('returns FAILED with a real reason rather than throwing or fabricating text', async () => {
    delete process.env.STT_PROVIDER;
    delete process.env.AI_PROVIDER;
    const result = await transcribeRecording({ buffer: Buffer.from('video bytes'), mimeType: 'video/webm' });
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.error).toMatch(/not configured/i);
  });
});

describe('transcribeRecording — size cap', () => {
  it('fails clearly for a recording over the transcribable size limit, without calling any provider', async () => {
    process.env.STT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const oversized = Buffer.alloc(MAX_TRANSCRIBABLE_BYTES + 1);
    const result = await transcribeRecording({ buffer: oversized, mimeType: 'video/webm' });

    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.error).toMatch(/exceeds/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('transcribeRecording — OpenAI', () => {
  it('returns FAILED when OPENAI_API_KEY is missing', async () => {
    process.env.STT_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    const result = await transcribeRecording({ buffer: Buffer.from('x'), mimeType: 'video/webm' });
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.error).toMatch(/OPENAI_API_KEY/);
  });

  it('returns the transcript on a successful response', async () => {
    process.env.STT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'This is my answer to the question.' }) })
    );
    const result = await transcribeRecording({ buffer: Buffer.from('video bytes'), mimeType: 'video/webm' });
    expect(result).toEqual({ status: 'COMPLETED', text: 'This is my answer to the question.' });
  });

  it('fails clearly on a non-OK provider response, never fabricating a transcript', async () => {
    process.env.STT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad file' }));
    const result = await transcribeRecording({ buffer: Buffer.from('video bytes'), mimeType: 'video/webm' });
    expect(result.status).toBe('FAILED');
  });

  it('fails clearly on an empty transcript rather than returning blank text as success', async () => {
    process.env.STT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: '   ' }) }));
    const result = await transcribeRecording({ buffer: Buffer.from('video bytes'), mimeType: 'video/webm' });
    expect(result.status).toBe('FAILED');
  });
});

describe('transcribeRecording — Gemini', () => {
  it('returns the transcript on a successful response', async () => {
    process.env.STT_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Verbatim spoken answer.' }] } }] }),
      })
    );
    const result = await transcribeRecording({ buffer: Buffer.from('video bytes'), mimeType: 'video/mp4' });
    expect(result).toEqual({ status: 'COMPLETED', text: 'Verbatim spoken answer.' });
  });

  it('returns FAILED when GEMINI_API_KEY is missing', async () => {
    process.env.STT_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    const result = await transcribeRecording({ buffer: Buffer.from('x'), mimeType: 'video/webm' });
    expect(result.status).toBe('FAILED');
  });
});
