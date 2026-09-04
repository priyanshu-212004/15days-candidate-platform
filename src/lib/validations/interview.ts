import { z } from 'zod';

export const questionTypeEnum = z.enum(['BEHAVIORAL', 'TECHNICAL', 'SITUATIONAL', 'CULTURE_FIT']);
export const questionDifficultyEnum = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const interviewStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED']);
// The recruiter's choice of how a question must be answered. Never
// candidate-selectable — see the candidate answer/recording routes, which
// enforce this server-side regardless of what the client sends.
export const answerTypeEnum = z.enum(['VIDEO', 'TEXT']);

// ---------------------------------------------------------------------------
// Interview setup (step 1 of the creation wizard)
// ---------------------------------------------------------------------------

export const interviewSetupSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
  maxAttempts: z.coerce.number().int().min(1).max(5).default(1),
  languages: z.array(z.string().trim().min(2).max(10)).min(1).max(10).default(['en']),
  requireCv: z.boolean().default(true),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  // Defaults to STATIC so every existing create-interview call site (and
  // any client that predates this field) keeps behaving exactly as before.
  interviewType: z.enum(['STATIC', 'ADAPTIVE_VOICE']).default('STATIC'),
});
export type InterviewSetupInput = z.infer<typeof interviewSetupSchema>;

export const interviewUpdateSchema = interviewSetupSchema.partial();
export type InterviewUpdateInput = z.infer<typeof interviewUpdateSchema>;

// ---------------------------------------------------------------------------
// AI question generation request + response validation
// ---------------------------------------------------------------------------

export const generateQuestionsRequestSchema = z.object({
  questionCount: z.coerce.number().int().min(3).max(12).default(6),
  focusAreas: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
});
export type GenerateQuestionsInput = z.infer<typeof generateQuestionsRequestSchema>;

// This is the shape we require back from the AI provider before we trust it
// enough to write to the database. Anything that doesn't parse is rejected.
export const aiQuestionSchema = z.object({
  text: z.string().trim().min(10).max(600),
  type: questionTypeEnum,
  category: z.string().trim().min(1).max(80).optional().nullable(),
  difficulty: questionDifficultyEnum,
  expectedDurationSec: z.number().int().min(30).max(600),
  evaluationCriteria: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
});
export type AiQuestion = z.infer<typeof aiQuestionSchema>;

export const aiQuestionResponseSchema = z.object({
  questions: z.array(aiQuestionSchema).min(1).max(20),
});

// ---------------------------------------------------------------------------
// Manual question create/update/reorder
// ---------------------------------------------------------------------------

export const questionCreateSchema = z.object({
  text: z.string().trim().min(10, 'Question must be at least 10 characters').max(600),
  type: questionTypeEnum.default('BEHAVIORAL'),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  difficulty: questionDifficultyEnum.default('MEDIUM'),
  expectedDurationSec: z.coerce.number().int().min(30).max(600).default(120),
  evaluationCriteria: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  answerType: answerTypeEnum.default('VIDEO'),
});
export type QuestionCreateInput = z.infer<typeof questionCreateSchema>;

export const questionUpdateSchema = questionCreateSchema.partial();
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

export const questionReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(50),
});

// ---------------------------------------------------------------------------
// Phase 6: Adaptive voice interview — blueprint + turn-by-turn AI decision
// ---------------------------------------------------------------------------

export const interviewTypeEnum = z.enum(['STATIC', 'ADAPTIVE_VOICE']);

export const evaluationAreaSchema = z.object({
  name: z.string().trim().min(1).max(60),
  weight: z.number().min(1).max(100),
  targetLevel: z.string().trim().min(1).max(40).optional(),
});
export type EvaluationArea = z.infer<typeof evaluationAreaSchema>;

// What HR submits when creating/editing a blueprint. Weights don't have to
// sum to exactly 100 at the type level — validated separately in the route
// so the error message can be specific ("weights sum to 115, not 100").
export const blueprintInputSchema = z.object({
  durationTargetMin: z.coerce.number().int().min(5).max(90).default(20),
  durationMinMin: z.coerce.number().int().min(3).max(90).default(15),
  durationMaxMin: z.coerce.number().int().min(5).max(120).default(22),
  graceSeconds: z.coerce.number().int().min(0).max(300).default(60),
  maxFollowUpsPerTopic: z.coerce.number().int().min(0).max(5).default(2),
  evaluationAreas: z.array(evaluationAreaSchema).min(1).max(10),
});
export type BlueprintInput = z.infer<typeof blueprintInputSchema>;

// AI-suggested starting blueprint from a job description — HR reviews/edits
// before publishing, same "never blindly trust raw AI output" rule as
// question generation.
export const aiBlueprintResponseSchema = z.object({
  evaluationAreas: z.array(evaluationAreaSchema).min(2).max(8),
});

// The structured decision the AI must return after every candidate answer
// (task spec §8). Rejected and retried if it doesn't match this shape —
// the backend never acts on unvalidated AI output.
export const adaptiveActionEnum = z.enum(['FOLLOW_UP', 'NEW_TOPIC', 'CLARIFICATION', 'END_INTERVIEW']);

export const adaptiveEvidenceUpdateSchema = z.object({
  topic: z.string().trim().min(1).max(60),
  score: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  newEvidence: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
});

export const adaptiveDecisionSchema = z.object({
  action: adaptiveActionEnum,
  topic: z.string().trim().min(1).max(60).optional(),
  reason: z.string().trim().min(1).max(400),
  question: z.string().trim().min(5).max(600).optional(),
  difficulty: questionDifficultyEnum.optional(),
  // Evidence extracted from the answer just given — may be omitted only
  // when there was no prior answer to analyze (the very first question).
  evidenceUpdate: adaptiveEvidenceUpdateSchema.optional(),
});
export type AdaptiveDecision = z.infer<typeof adaptiveDecisionSchema>;

// FOLLOW_UP/NEW_TOPIC/CLARIFICATION must carry a question; END_INTERVIEW
// must not need one. Enforced with a refinement rather than baked into the
// union above so a malformed-but-close AI response still produces one clear
// validation error instead of Zod's less-readable union mismatch output.
export const adaptiveDecisionRefinedSchema = adaptiveDecisionSchema.refine(
  (d) => d.action === 'END_INTERVIEW' || !!d.question,
  { message: 'question is required unless action is END_INTERVIEW', path: ['question'] }
);

export const finalAdaptiveEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(10),
  skillScores: z.record(z.string(), z.number().min(0).max(10)),
  strengths: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  weaknesses: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  recommendation: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1200),
});
export type FinalAdaptiveEvaluation = z.infer<typeof finalAdaptiveEvaluationSchema>;
