/**
 * AI question-generation abstraction.
 *
 * Server-only. The browser never sees an API key or calls a provider
 * directly — everything goes through generateInterviewQuestions(), which
 * hides which provider/model is behind it so call sites don't change if we
 * switch providers later.
 *
 * The actual provider call (OpenAI / Anthropic / Gemini) lives in
 * src/lib/ai-provider.ts and is shared with src/lib/ai-evaluation.ts, so
 * adding a provider or changing how a provider is called only happens in
 * one place. AiConfigError/AiGenerationError are re-exported from here for
 * backward compatibility with existing call sites.
 *
 * Configure via AI_PROVIDER ("openai" | "anthropic" | "gemini"),
 * OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY, and optionally
 * AI_MODEL.
 */

import 'server-only';
import { aiQuestionResponseSchema, type AiQuestion } from '@/lib/validations/interview';
import { callAiProvider, extractJson, AiConfigError, AiGenerationError } from '@/lib/ai-provider';

export { AiConfigError, AiGenerationError };

export interface GenerateQuestionsParams {
  jobTitle: string;
  jobDescription: string;
  requirements: string[];
  skills: string[];
  experienceLevel?: string | null;
  questionCount: number;
  focusAreas?: string[];
}

function buildPrompt(params: GenerateQuestionsParams): string {
  const {
    jobTitle,
    jobDescription,
    requirements,
    skills,
    experienceLevel,
    questionCount,
    focusAreas,
  } = params;

  return `You are helping a recruiter design an asynchronous video interview.

Job title: ${jobTitle}
Experience level: ${experienceLevel || 'Not specified'}
Key skills: ${skills.length ? skills.join(', ') : 'Not specified'}
Requirements: ${requirements.length ? requirements.join('; ') : 'Not specified'}
${focusAreas?.length ? `Recruiter-requested focus areas: ${focusAreas.join(', ')}` : ''}

Job description:
"""
${jobDescription}
"""

Generate exactly ${questionCount} interview questions a candidate will answer asynchronously,
one at a time, with no interviewer present. Mix question types across BEHAVIORAL,
TECHNICAL, SITUATIONAL, and CULTURE_FIT as appropriate for this role. Vary difficulty
across EASY, MEDIUM, and HARD. Each question needs a realistic expected answer duration
in seconds (60-240 is typical) and 2-4 short evaluation criteria a reviewer would look for.

Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "questions": [
    {
      "text": "string",
      "type": "BEHAVIORAL" | "TECHNICAL" | "SITUATIONAL" | "CULTURE_FIT",
      "category": "short label, e.g. 'System design'",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "expectedDurationSec": number,
      "evaluationCriteria": ["string", ...]
    }
  ]
}`;
}

/**
 * Generates structured interview questions for a job using the configured
 * AI provider. Throws AiConfigError if no provider/key is configured (the
 * caller should surface this as a clear "AI is not configured" message —
 * never fabricate questions instead), or AiGenerationError if the provider
 * call or response validation fails.
 */
export async function generateInterviewQuestions(
  params: GenerateQuestionsParams
): Promise<AiQuestion[]> {
  const prompt = buildPrompt(params);
  const rawText = await callAiProvider(prompt, { temperature: 0.6, maxTokens: 2000 });

  const parsedJson = extractJson(rawText);
  const validated = aiQuestionResponseSchema.safeParse(parsedJson);

  if (!validated.success) {
    console.error('[ai] AI response failed schema validation:', validated.error.flatten());
    throw new AiGenerationError('AI returned questions in an unexpected format. Please try again.');
  }

  return validated.data.questions;
}
