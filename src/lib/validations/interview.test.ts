import { describe, it, expect } from 'vitest';
import {
  interviewSetupSchema,
  aiQuestionResponseSchema,
  questionCreateSchema,
  questionReorderSchema,
} from './interview';

describe('interviewSetupSchema', () => {
  it('accepts a valid setup payload', () => {
    const result = interviewSetupSchema.safeParse({
      title: 'Backend Engineer Interview',
      maxAttempts: 1,
      languages: ['en'],
      requireCv: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a title under 3 characters', () => {
    const result = interviewSetupSchema.safeParse({ title: 'Hi' });
    expect(result.success).toBe(false);
  });

  it('rejects maxAttempts above 5', () => {
    const result = interviewSetupSchema.safeParse({ title: 'Valid Title', maxAttempts: 10 });
    expect(result.success).toBe(false);
  });

  it('defaults languages to ["en"] and requireCv to true', () => {
    const result = interviewSetupSchema.safeParse({ title: 'Valid Title' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.languages).toEqual(['en']);
      expect(result.data.requireCv).toBe(true);
    }
  });
});

describe('aiQuestionResponseSchema (AI response validation)', () => {
  const validQuestion = {
    text: 'Tell me about a time you resolved a production incident under pressure.',
    type: 'BEHAVIORAL' as const,
    category: 'Incident response',
    difficulty: 'MEDIUM' as const,
    expectedDurationSec: 120,
    evaluationCriteria: ['Clear ownership', 'Calm under pressure'],
  };

  it('accepts a well-formed AI response', () => {
    const result = aiQuestionResponseSchema.safeParse({ questions: [validQuestion] });
    expect(result.success).toBe(true);
  });

  it('rejects malformed JSON shape (missing questions key)', () => {
    const result = aiQuestionResponseSchema.safeParse({ items: [validQuestion] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty questions array', () => {
    const result = aiQuestionResponseSchema.safeParse({ questions: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a question with an invalid type enum value', () => {
    const result = aiQuestionResponseSchema.safeParse({
      questions: [{ ...validQuestion, type: 'RANDOM_TYPE' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a question with an invalid difficulty enum value', () => {
    const result = aiQuestionResponseSchema.safeParse({
      questions: [{ ...validQuestion, difficulty: 'IMPOSSIBLE' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a question with too-short text', () => {
    const result = aiQuestionResponseSchema.safeParse({
      questions: [{ ...validQuestion, text: 'Short' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a question with a non-numeric duration', () => {
    const result = aiQuestionResponseSchema.safeParse({
      questions: [{ ...validQuestion, expectedDurationSec: 'two minutes' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a duration outside the allowed range', () => {
    const result = aiQuestionResponseSchema.safeParse({
      questions: [{ ...validQuestion, expectedDurationSec: 5 }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults evaluationCriteria to an empty array when omitted', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { evaluationCriteria, ...rest } = validQuestion;
    const result = aiQuestionResponseSchema.safeParse({ questions: [rest] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0]!.evaluationCriteria).toEqual([]);
    }
  });
});

describe('questionCreateSchema', () => {
  it('accepts a valid manual question', () => {
    const result = questionCreateSchema.safeParse({
      text: 'Describe your experience with distributed systems.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects text under 10 characters', () => {
    const result = questionCreateSchema.safeParse({ text: 'Too short' });
    expect(result.success).toBe(false);
  });

  it('defaults answerType to VIDEO when not provided', () => {
    const result = questionCreateSchema.safeParse({
      text: 'Describe your experience with distributed systems.',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.answerType).toBe('VIDEO');
  });

  it('accepts an explicit TEXT answerType', () => {
    const result = questionCreateSchema.safeParse({
      text: 'Which database systems have you used in production?',
      answerType: 'TEXT',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.answerType).toBe('TEXT');
  });

  it('rejects an invalid answerType', () => {
    const result = questionCreateSchema.safeParse({
      text: 'Which database systems have you used in production?',
      answerType: 'AUDIO',
    });
    expect(result.success).toBe(false);
  });
});

describe('questionReorderSchema', () => {
  it('accepts a list of UUIDs', () => {
    const result = questionReorderSchema.safeParse({
      order: ['3fa85f64-5717-4562-b3fc-2c963f66afa6', '3fa85f64-5717-4562-b3fc-2c963f66afa7'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID entry', () => {
    const result = questionReorderSchema.safeParse({ order: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty order list', () => {
    const result = questionReorderSchema.safeParse({ order: [] });
    expect(result.success).toBe(false);
  });
});
