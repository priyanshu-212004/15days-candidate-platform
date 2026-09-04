/**
 * Adaptive voice interview engine.
 *
 * Reuses src/lib/ai-provider.ts (the same OpenAI/Anthropic/Gemini
 * abstraction used by question generation and evaluation) rather than
 * introducing a second AI configuration surface. Per task spec §13/§15,
 * this module is careful to:
 *   - keep all deterministic decisions (time limits, follow-up limits,
 *     topic bookkeeping) in interview-engine-rules.ts, calling the AI only
 *     for actual language reasoning/generation.
 *   - combine "analyze the answer + decide next action + generate the next
 *     question" into a single AI call per turn, instead of three separate
 *     calls, to control token/cost usage.
 *   - send a compact state (evidence + current topic + last exchange) each
 *     turn instead of the full transcript.
 *   - never trust raw AI output — every response is schema-validated
 *     (adaptiveDecisionRefinedSchema) before anything is written to the
 *     database or shown to the candidate.
 */

import 'server-only';
import {
  callAiProviderWithUsage,
  extractJson,
  AiConfigError,
  AiGenerationError,
} from '@/lib/ai-provider';
import {
  aiBlueprintResponseSchema,
  adaptiveDecisionRefinedSchema,
  finalAdaptiveEvaluationSchema,
  type EvaluationArea,
  type AdaptiveDecision,
  type FinalAdaptiveEvaluation,
} from '@/lib/validations/interview';
import { logAiUsage, estimateTokens, type AiUsagePurpose } from '@/lib/ai-usage';

export { AiConfigError, AiGenerationError };

// ---------------------------------------------------------------------------
// Blueprint suggestion (HR interview-creation time — one cheap call)
// ---------------------------------------------------------------------------

export interface SuggestBlueprintParams {
  jobTitle: string;
  jobDescription: string;
  requirements: string[];
  skills: string[];
  experienceLevel?: string | null;
}

async function callAndLog(params: {
  prompt: string;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
  purpose: AiUsagePurpose;
  interviewId?: string;
  applicationId?: string;
}): Promise<string> {
  try {
    const result = await callAiProviderWithUsage(params.prompt, {
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    });
    const outputTokens = result.usage.outputTokens || estimateTokens(result.text);
    const inputTokens = result.usage.inputTokens || estimateTokens(params.prompt);
    await logAiUsage({
      provider: result.provider,
      model: result.model,
      purpose: params.purpose,
      interviewId: params.interviewId,
      applicationId: params.applicationId,
      inputTokens,
      outputTokens,
      succeeded: true,
    });
    return result.text;
  } catch (err) {
    await logAiUsage({
      provider: process.env.AI_PROVIDER ?? 'unknown',
      model: process.env.AI_MODEL ?? 'default',
      purpose: params.purpose,
      interviewId: params.interviewId,
      applicationId: params.applicationId,
      inputTokens: estimateTokens(params.prompt),
      outputTokens: 0,
      succeeded: false,
    });
    throw err;
  }
}

/** Suggests a starting evaluation-area blueprint from the job. HR reviews/edits before publishing — never auto-published. */
export async function suggestBlueprint(params: SuggestBlueprintParams, interviewId?: string): Promise<EvaluationArea[]> {
  const prompt = `You are helping a recruiter design a live, voice-based adaptive AI interview.

Job title: ${params.jobTitle}
Experience level: ${params.experienceLevel || 'Not specified'}
Key skills: ${params.skills.length ? params.skills.join(', ') : 'Not specified'}
Requirements: ${params.requirements.length ? params.requirements.join('; ') : 'Not specified'}

Job description:
"""
${params.jobDescription}
"""

Propose 3-6 evaluation areas this interview should assess (e.g. specific
technologies, system design, problem solving, communication). Weights must
be positive numbers that sum to 100. Only include a "targetLevel" when the
role clearly calls for a specific proficiency (e.g. "advanced", "senior") —
omit it otherwise.

Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "evaluationAreas": [
    { "name": "string", "weight": number, "targetLevel": "string (optional)" }
  ]
}`;

  const rawText = await callAndLog({
    prompt,
    temperature: 0.5,
    maxTokens: 800,
    purpose: 'QUESTION_GEN',
    interviewId,
  });
  const parsed = extractJson(rawText);
  const validated = aiBlueprintResponseSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('[interview-engine] blueprint suggestion failed schema validation:', validated.error.flatten());
    throw new AiGenerationError('AI returned a blueprint in an unexpected format.');
  }
  return validated.data.evaluationAreas;
}

// ---------------------------------------------------------------------------
// Turn-by-turn adaptive engine (candidate-facing — live interview)
// ---------------------------------------------------------------------------

export interface EvidenceEntry {
  score: number;
  confidence: number;
  evidence: string[];
}

export interface CompactState {
  jobTitle: string;
  evaluationAreas: EvaluationArea[];
  currentTopic: string | null;
  topicsCovered: string[];
  topicsRemaining: string[];
  candidateEvidence: Record<string, EvidenceEntry>;
  /** Only the most recent exchange — never the full transcript, to bound token usage (task spec §15). */
  lastQuestion: string | null;
  lastAnswer: string | null;
  questionCount: number;
  elapsedSec: number;
  targetSec: number;
}

function buildTurnPrompt(state: CompactState): string {
  const evidenceLines = Object.entries(state.candidateEvidence)
    .map(([topic, e]) => `- ${topic}: score ${e.score}/10, confidence ${e.confidence}, evidence: ${e.evidence.join('; ') || 'none yet'}`)
    .join('\n') || 'None yet — this is the first question.';

  return `You are conducting a live, adaptive, voice-based technical interview for the role of ${state.jobTitle}.

Evaluation areas to cover (name: weight, target level):
${state.evaluationAreas.map((a) => `- ${a.name}: weight ${a.weight}${a.targetLevel ? `, target level ${a.targetLevel}` : ''}`).join('\n')}

Topics already covered: ${state.topicsCovered.join(', ') || 'none'}
Topics remaining: ${state.topicsRemaining.join(', ') || 'none'}
Current topic: ${state.currentTopic ?? 'none yet — pick the first topic'}

Candidate evidence so far:
${evidenceLines}

${state.lastQuestion ? `Your last question: "${state.lastQuestion}"` : 'No question has been asked yet.'}
${state.lastAnswer ? `Candidate's answer: "${state.lastAnswer}"` : ''}

Interview progress: question #${state.questionCount + 1}, ${state.elapsedSec}s elapsed of a ~${state.targetSec}s target.

${state.lastAnswer ? `First, analyze the candidate's answer: what skills/evidence did it demonstrate, and what is still missing for the current topic? Then decide what happens next.` : 'Generate the first question.'}

Decide ONE of: FOLLOW_UP (probe deeper on the current topic — only if something
important is missing), NEW_TOPIC (move to an uncovered topic — once you have
enough evidence on the current one), CLARIFICATION (the answer was unclear or
off-topic), or END_INTERVIEW (only if topics remaining is empty or the
interview is clearly running long).

Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "action": "FOLLOW_UP" | "NEW_TOPIC" | "CLARIFICATION" | "END_INTERVIEW",
  "topic": "string (the topic this question targets; omit only for END_INTERVIEW)",
  "reason": "one short sentence explaining the decision",
  "question": "the next question to ask the candidate, spoken naturally, one at a time (omit only for END_INTERVIEW)",
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "evidenceUpdate": {
    "topic": "string — the topic the PREVIOUS answer provided evidence for (omit if this is the first question)",
    "score": number (0-10, this topic's evidence so far),
    "confidence": number (0-1),
    "newEvidence": ["short phrases describing what the answer demonstrated"]
  }
}`;
}

export interface NextTurnResult {
  decision: AdaptiveDecision;
}

/**
 * The single combined "analyze + decide + generate" call per task spec
 * §15. Never trusts the raw response — validated against
 * adaptiveDecisionRefinedSchema before being returned to the caller, which
 * is responsible for applying the deterministic rules (follow-up/topic/time
 * limits) on top of this before acting on it.
 */
export async function getNextTurn(
  state: CompactState,
  context: { interviewId?: string; applicationId?: string }
): Promise<NextTurnResult> {
  const prompt = buildTurnPrompt(state);
  const rawText = await callAndLog({
    prompt,
    temperature: 0.6,
    maxTokens: 700,
    purpose: 'ADAPTIVE_TURN',
    interviewId: context.interviewId,
    applicationId: context.applicationId,
  });
  const parsed = extractJson(rawText);
  const validated = adaptiveDecisionRefinedSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('[interview-engine] adaptive turn failed schema validation:', validated.error.flatten());
    throw new AiGenerationError('AI returned a next-question decision in an unexpected format.');
  }
  return { decision: validated.data };
}

// ---------------------------------------------------------------------------
// Final evaluation
// ---------------------------------------------------------------------------

export interface GenerateAdaptiveEvaluationParams {
  jobTitle: string;
  candidateName: string;
  evaluationAreas: EvaluationArea[];
  candidateEvidence: Record<string, EvidenceEntry>;
}

/** Uses the accumulated evidence profile, not the full transcript (task spec §11/§15). */
export async function generateAdaptiveEvaluation(
  params: GenerateAdaptiveEvaluationParams,
  context: { interviewId?: string; applicationId?: string }
): Promise<FinalAdaptiveEvaluation> {
  const evidenceLines = Object.entries(params.candidateEvidence)
    .map(([topic, e]) => `- ${topic}: score ${e.score}/10, confidence ${e.confidence}\n  Evidence: ${e.evidence.join('; ') || 'none'}`)
    .join('\n');

  const prompt = `You are producing a final hiring evaluation for a completed adaptive AI interview.

Candidate: ${params.candidateName}
Role: ${params.jobTitle}

Evaluation areas and weights: ${params.evaluationAreas.map((a) => `${a.name} (${a.weight}%)`).join(', ')}

Accumulated evidence gathered during the interview:
${evidenceLines || 'No evidence was recorded.'}

Produce a weighted overall score and a per-area score using only this
evidence — do not invent evidence that wasn't gathered. If an evaluation
area has little or no evidence, say so explicitly and score conservatively.

Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "overallScore": number (0-10),
  "skillScores": { "<area name>": number (0-10), ... },
  "strengths": ["string", ...],
  "weaknesses": ["string", ...],
  "recommendation": "one short phrase, e.g. 'Strong candidate' or 'Not a fit for this role'",
  "summary": "string"
}`;

  const rawText = await callAndLog({
    prompt,
    temperature: 0.4,
    maxTokens: 1200,
    purpose: 'ADAPTIVE_EVALUATION',
    interviewId: context.interviewId,
    applicationId: context.applicationId,
  });
  const parsed = extractJson(rawText);
  const validated = finalAdaptiveEvaluationSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('[interview-engine] final evaluation failed schema validation:', validated.error.flatten());
    throw new AiGenerationError('AI returned a final evaluation in an unexpected format.');
  }
  return validated.data;
}
