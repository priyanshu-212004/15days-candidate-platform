/**
 * AI evaluation abstraction. Uses the same shared provider call
 * (src/lib/ai-provider.ts) as question generation — rather than a second,
 * unrelated AI configuration surface — so AI_PROVIDER / AI_MODEL and the
 * OpenAI/Anthropic/Gemini keys configure both features identically.
 *
 * Server-only. Evaluation is always recruiter-triggered — never a
 * requirement for candidate submission to succeed.
 */

import 'server-only';
import { z } from 'zod';
import { callAiProvider, extractJson, AiConfigError, AiGenerationError, isAiConfigured } from '@/lib/ai-provider';

export { AiConfigError, AiGenerationError, isAiConfigured };

const evaluationScoreSchema = z.object({
  category: z.enum(['TECHNICAL', 'COMMUNICATION', 'CONFIDENCE', 'ROLE_FIT', 'RELEVANCE', 'COMPLETENESS']),
  score: z.number().min(0).max(10),
  rationale: z.string().trim().min(1).max(500).optional(),
});

const evaluationResponseSchema = z.object({
  overallScore: z.number().min(0).max(10),
  summary: z.string().trim().min(1).max(1000),
  strengths: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  concerns: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  scores: z.array(evaluationScoreSchema).min(1).max(6),
});
export type AiEvaluationResult = z.infer<typeof evaluationResponseSchema>;

export interface EvaluateAnswerInput {
  questionText: string;
  answerText: string | null;
  hasRecordingWithoutTranscript: boolean;
}

export interface EvaluateApplicationParams {
  jobTitle: string;
  candidateName: string;
  answers: EvaluateAnswerInput[];
}

function buildPrompt(params: EvaluateApplicationParams): string {
  const answerBlocks = params.answers
    .map((a, i) => {
      const body = a.answerText
        ? a.answerText
        : a.hasRecordingWithoutTranscript
          ? '[Video recording submitted — transcript not yet available]'
          : '[No answer submitted]';
      return `Q${i + 1}: ${a.questionText}\nA${i + 1}: ${body}`;
    })
    .join('\n\n');

  return `You are helping a recruiter review a completed asynchronous interview.

Candidate: ${params.candidateName}
Role: ${params.jobTitle}

${answerBlocks}

Evaluate the candidate's answers as written above. Score 0-10 on whichever of
these categories are relevant given the available answers: TECHNICAL,
COMMUNICATION, CONFIDENCE, ROLE_FIT, RELEVANCE, COMPLETENESS. If an answer is
missing or only a recording with no transcript, note that explicitly in your
summary rather than guessing at its content.

Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "overallScore": number (0-10),
  "summary": "string",
  "strengths": ["string", ...],
  "concerns": ["string", ...],
  "scores": [{ "category": "TECHNICAL" | "COMMUNICATION" | "CONFIDENCE" | "ROLE_FIT" | "RELEVANCE" | "COMPLETENESS", "score": number, "rationale": "string" }]
}`;
}

/**
 * Throws AiConfigError when no provider/key is configured — callers must
 * surface a clear "not configured" state and must never fabricate a score
 * as a fallback. Throws AiGenerationError on a provider/validation failure.
 */
export async function evaluateApplication(params: EvaluateApplicationParams): Promise<AiEvaluationResult> {
  const prompt = buildPrompt(params);
  const rawText = await callAiProvider(prompt, { temperature: 0.4, maxTokens: 1500 });

  const parsedJson = extractJson(rawText);
  const validated = evaluationResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error('[ai-evaluation] AI response failed schema validation:', validated.error.flatten());
    throw new AiGenerationError('AI returned an evaluation in an unexpected format.');
  }
  return validated.data;
}

// ---------------------------------------------------------------------------
// Resume evaluation — same shared provider call as answer evaluation above,
// different prompt/schema because it's scoring a resume against a job, not
// interview answers. See ResumeEvaluation in prisma/schema.prisma for why
// this is a separate model from Evaluation.
// ---------------------------------------------------------------------------

const resumeEvaluationResponseSchema = z.object({
  overallScore: z.number().min(0).max(10),
  skillsMatchScore: z.number().min(0).max(10),
  experienceMatchScore: z.number().min(0).max(10),
  relevanceScore: z.number().min(0).max(10),
  strengths: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  missingSkills: z.array(z.string().trim().min(1).max(150)).max(15).default([]),
  concerns: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  recommendation: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(1000),
});
export type AiResumeEvaluationResult = z.infer<typeof resumeEvaluationResponseSchema>;

export interface EvaluateResumeParams {
  jobTitle: string;
  jobDescription: string;
  requirements: string[];
  skills: string[];
  experienceLevel?: string | null;
  candidateName: string;
  resumeText: string;
}

function buildResumePrompt(params: EvaluateResumeParams): string {
  return `You are helping a recruiter evaluate a candidate's resume against a specific job.

Candidate: ${params.candidateName}

Job title: ${params.jobTitle}
Experience level required: ${params.experienceLevel || 'Not specified'}
Required/key skills: ${params.skills.length ? params.skills.join(', ') : 'Not specified'}
Requirements: ${params.requirements.length ? params.requirements.join('; ') : 'Not specified'}

Job description:
"""
${params.jobDescription}
"""

Resume (extracted text):
"""
${params.resumeText}
"""

Evaluate how well this resume matches this specific job. Consider skills overlap,
relevant experience and seniority, and overall fit. Be specific about which
required skills are missing or unclear from the resume — don't guess at
skills the resume doesn't mention.

Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "overallScore": number (0-10),
  "skillsMatchScore": number (0-10),
  "experienceMatchScore": number (0-10),
  "relevanceScore": number (0-10),
  "strengths": ["string", ...],
  "missingSkills": ["string", ...],
  "concerns": ["string", ...],
  "recommendation": "one short sentence, e.g. 'Strong match — advance to interview' or 'Weak match on required skills'",
  "summary": "string"
}`;
}

/**
 * Throws AiConfigError when no provider/key is configured, AiGenerationError
 * on a provider/validation failure. Never fabricates a score — callers must
 * surface these as real failures, not silently substitute a default.
 */
export async function evaluateResume(params: EvaluateResumeParams): Promise<AiResumeEvaluationResult> {
  const prompt = buildResumePrompt(params);
  const rawText = await callAiProvider(prompt, { temperature: 0.4, maxTokens: 1200 });

  const parsedJson = extractJson(rawText);
  const validated = resumeEvaluationResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error('[ai-evaluation] Resume AI response failed schema validation:', validated.error.flatten());
    throw new AiGenerationError('AI returned a resume evaluation in an unexpected format.');
  }
  return validated.data;
}
