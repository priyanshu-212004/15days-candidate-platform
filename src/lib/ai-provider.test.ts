import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callAiProvider, extractJson, getConfiguredProvider, isAiConfigured, AiConfigError, AiGenerationError } from './ai-provider';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('isAiConfigured / getConfiguredProvider', () => {
  it('is false / throws when AI_PROVIDER is unset', () => {
    delete process.env.AI_PROVIDER;
    expect(isAiConfigured()).toBe(false);
    expect(() => getConfiguredProvider()).toThrow(AiConfigError);
  });

  it('throws AiConfigError for an unrecognized provider name', () => {
    process.env.AI_PROVIDER = 'not-a-real-provider';
    expect(() => getConfiguredProvider()).toThrow(AiConfigError);
  });

  it('accepts gemini as a valid provider name', () => {
    process.env.AI_PROVIDER = 'gemini';
    expect(getConfiguredProvider()).toBe('gemini');
  });
});

describe('callAiProvider — gemini', () => {
  it('throws AiConfigError when GEMINI_API_KEY is missing', async () => {
    process.env.AI_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    await expect(callAiProvider('hello')).rejects.toThrow(AiConfigError);
  });

  it('throws AiGenerationError when Gemini returns a non-OK response', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }));
    await expect(callAiProvider('hello')).rejects.toThrow(AiGenerationError);
  });

  it('extracts text from a well-formed Gemini response', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
      })
    );
    const text = await callAiProvider('hello');
    expect(text).toBe('{"ok":true}');
  });

  it('throws AiGenerationError when Gemini returns no candidates', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }));
    await expect(callAiProvider('hello')).rejects.toThrow(AiGenerationError);
  });
});

describe('callAiProvider — anthropic', () => {
  it('throws AiConfigError when ANTHROPIC_API_KEY is missing', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callAiProvider('hello')).rejects.toThrow(AiConfigError);
  });

  it('extracts text from a well-formed Anthropic response', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'hi there' }] }) })
    );
    const text = await callAiProvider('hello');
    expect(text).toBe('hi there');
  });
});

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers a JSON object embedded in surrounding prose', () => {
    expect(extractJson('Sure, here it is: {"a":1} — hope that helps!')).toEqual({ a: 1 });
  });

  it('throws AiGenerationError for unparseable text', () => {
    expect(() => extractJson('not json at all')).toThrow(AiGenerationError);
  });
});
