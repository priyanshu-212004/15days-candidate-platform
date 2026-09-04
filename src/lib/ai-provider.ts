/**
 * Shared low-level "call the configured AI provider with a prompt and get
 * raw text back" abstraction. src/lib/ai.ts (question generation) and
 * src/lib/ai-evaluation.ts (resume/answer evaluation) both build their own
 * prompts and response schemas on top of this — this module only knows how
 * to talk to a provider, not what the app is asking it to do.
 *
 * Configure via:
 *   AI_PROVIDER=openai | anthropic | gemini
 *   AI_MODEL=<optional override>
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY
 *
 * Server-only. The browser never sees a key or calls a provider directly.
 */

import 'server-only';

export class AiConfigError extends Error {
  constructor(message = 'AI provider is not configured') {
    super(message);
    this.name = 'AiConfigError';
  }
}

export class AiGenerationError extends Error {
  constructor(message = 'AI generation failed') {
    super(message);
    this.name = 'AiGenerationError';
  }
}

export type AiProviderName = 'openai' | 'anthropic' | 'gemini';

const SUPPORTED_PROVIDERS: AiProviderName[] = ['openai', 'anthropic', 'gemini'];

const DEFAULT_MODEL: Record<AiProviderName, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash',
};

export function isAiConfigured(): boolean {
  return !!process.env.AI_PROVIDER;
}

export function getConfiguredProvider(): AiProviderName {
  const provider = process.env.AI_PROVIDER;
  if (!provider) {
    throw new AiConfigError('No AI provider is configured. Set AI_PROVIDER in your environment.');
  }
  if (!SUPPORTED_PROVIDERS.includes(provider as AiProviderName)) {
    throw new AiConfigError(
      `Unsupported AI_PROVIDER: "${provider}". Supported values: ${SUPPORTED_PROVIDERS.join(', ')}.`
    );
  }
  return provider as AiProviderName;
}

export interface AiCallUsage {
  inputTokens: number;
  outputTokens: number;
}

async function callOpenAi(
  prompt: string,
  systemPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<{ text: string; usage: AiCallUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiConfigError('OPENAI_API_KEY is not set.');
  const model = process.env.AI_MODEL || DEFAULT_MODEL.openai;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AiGenerationError(`OpenAI API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new AiGenerationError('OpenAI returned an empty response');
  return {
    text,
    usage: {
      inputTokens: data?.usage?.prompt_tokens ?? 0,
      outputTokens: data?.usage?.completion_tokens ?? 0,
    },
  };
}

async function callAnthropic(
  prompt: string,
  maxTokens: number
): Promise<{ text: string; usage: AiCallUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiConfigError('ANTHROPIC_API_KEY is not set.');
  const model = process.env.AI_MODEL || DEFAULT_MODEL.anthropic;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AiGenerationError(`Anthropic API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.content?.find((block: { type: string }) => block.type === 'text')?.text;
  if (typeof text !== 'string' || !text.trim()) throw new AiGenerationError('Anthropic returned an empty response');
  return {
    text,
    usage: {
      inputTokens: data?.usage?.input_tokens ?? 0,
      outputTokens: data?.usage?.output_tokens ?? 0,
    },
  };
}

async function callGemini(
  prompt: string,
  systemPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<{ text: string; usage: AiCallUsage }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiConfigError('GEMINI_API_KEY is not set.');
  const model = process.env.AI_MODEL || DEFAULT_MODEL.gemini;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AiGenerationError(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (typeof text !== 'string' || !text.trim()) throw new AiGenerationError('Gemini returned an empty response');
  return {
    text,
    usage: {
      inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

export interface CallAiProviderOptions {
  /** System-level instruction. Ignored by providers with no system-message concept beyond what's supported here. */
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiCallResult {
  text: string;
  provider: AiProviderName;
  model: string;
  usage: AiCallUsage;
}

/**
 * Same as callAiProvider, but also returns which provider/model answered
 * and the token usage it reported — used by call sites (currently the
 * adaptive interview engine) that log AI cost/usage. Kept as a separate
 * function rather than changing callAiProvider's return type so every
 * existing caller of callAiProvider (question generation, evaluation)
 * keeps working unmodified.
 */
export async function callAiProviderWithUsage(
  prompt: string,
  options: CallAiProviderOptions = {}
): Promise<AiCallResult> {
  const provider = getConfiguredProvider();
  const systemPrompt =
    options.systemPrompt ??
    'You are a precise assistant that outputs only valid JSON, matching the requested schema exactly.';
  const maxTokens = options.maxTokens ?? 1500;
  const temperature = options.temperature ?? 0.5;
  const model = process.env.AI_MODEL || DEFAULT_MODEL[provider];

  let result: { text: string; usage: AiCallUsage };
  switch (provider) {
    case 'openai':
      result = await callOpenAi(prompt, systemPrompt, maxTokens, temperature);
      break;
    case 'anthropic':
      result = await callAnthropic(prompt, maxTokens);
      break;
    case 'gemini':
      result = await callGemini(prompt, systemPrompt, temperature, maxTokens);
      break;
    default: {
      // Exhaustiveness guard — getConfiguredProvider() already validated this.
      const _exhaustive: never = provider;
      throw new AiConfigError(`Unsupported AI_PROVIDER: ${_exhaustive as string}`);
    }
  }
  return { text: result.text, provider, model, usage: result.usage };
}

/**
 * Calls whichever provider is configured via AI_PROVIDER and returns its raw
 * text response. Callers are responsible for parsing/validating that text —
 * this function only handles "get a string back from the model."
 *
 * Throws AiConfigError if no provider/key is configured — never fabricate a
 * result as a fallback. Throws AiGenerationError on a provider-level failure
 * (HTTP error, empty response).
 */
export async function callAiProvider(prompt: string, options: CallAiProviderOptions = {}): Promise<string> {
  const result = await callAiProviderWithUsage(prompt, options);
  return result.text;
}

/** Extracts a JSON object from a model's raw text response, tolerating markdown fences some models add despite instructions. */
export function extractJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new AiGenerationError('AI response was not valid JSON');
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new AiGenerationError('AI response was not valid JSON');
    }
  }
}
