import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiConfigError, AiGenerationError } from '@/lib/ai';
import { evaluateApplication, evaluateResume, isAiConfigured } from './ai-evaluation';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

const sampleParams = {
  jobTitle: 'Senior Software Engineer',
  candidateName: 'Amara Chen',
  answers: [{ questionText: 'Tell me about a challenge you solved.', answerText: 'I redesigned our caching layer.', hasRecordingWithoutTranscript: false }],
};

describe('isAiConfigured', () => {
  it('is false when AI_PROVIDER is unset', () => {
    delete process.env.AI_PROVIDER;
    expect(isAiConfigured()).toBe(false);
  });

  it('is true when AI_PROVIDER is set', () => {
    process.env.AI_PROVIDER = 'openai';
    expect(isAiConfigured()).toBe(true);
  });
});

describe('evaluateApplication', () => {
  it('throws AiConfigError (never a fabricated score) when no provider is configured', async () => {
    delete process.env.AI_PROVIDER;
    await expect(evaluateApplication(sampleParams)).rejects.toThrow(AiConfigError);
  });

  it('throws AiConfigError for an unrecognized provider name', async () => {
    process.env.AI_PROVIDER = 'not-a-real-provider';
    await expect(evaluateApplication(sampleParams)).rejects.toThrow(AiConfigError);
  });

  it('throws AiConfigError when OPENAI_API_KEY is missing even though AI_PROVIDER=openai', async () => {
    process.env.AI_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    await expect(evaluateApplication(sampleParams)).rejects.toThrow(AiConfigError);
  });

  it('throws AiGenerationError when the provider call itself fails', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'internal error' })
    );
    await expect(evaluateApplication(sampleParams)).rejects.toThrow(AiGenerationError);
  });

  it('throws AiGenerationError when the model returns invalid JSON', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'not valid json at all' } }] }),
      })
    );
    await expect(evaluateApplication(sampleParams)).rejects.toThrow(AiGenerationError);
  });

  it('throws AiGenerationError when the model returns JSON that fails schema validation', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ overallScore: 'not-a-number', summary: 'ok' }) } }],
        }),
      })
    );
    await expect(evaluateApplication(sampleParams)).rejects.toThrow(AiGenerationError);
  });

  it('returns a validated result on a well-formed response', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    const wellFormed = {
      overallScore: 8.2,
      summary: 'Strong technical answer with clear structure.',
      strengths: ['Clear communication'],
      concerns: [],
      scores: [{ category: 'TECHNICAL', score: 8.5, rationale: 'Solid depth' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(wellFormed) } }] }),
      })
    );
    const result = await evaluateApplication(sampleParams);
    expect(result.overallScore).toBe(8.2);
    expect(result.scores[0]?.category).toBe('TECHNICAL');
  });
});

describe('evaluateResume', () => {
  const resumeParams = {
    jobTitle: 'Senior Software Engineer',
    jobDescription: 'We need a backend engineer with strong distributed-systems experience.',
    requirements: ['5+ years backend experience'],
    skills: ['Node.js', 'PostgreSQL', 'Kubernetes'],
    experienceLevel: 'Senior',
    candidateName: 'Amara Chen',
    resumeText: 'Senior backend engineer with 6 years building Node.js services on PostgreSQL and Kubernetes.',
  };

  const wellFormedResumeResult = {
    overallScore: 8.5,
    skillsMatchScore: 9,
    experienceMatchScore: 8,
    relevanceScore: 8.5,
    strengths: ['Strong Node.js background'],
    missingSkills: ['Terraform'],
    concerns: [],
    recommendation: 'Strong match — advance to interview',
    summary: 'Well-aligned with the role.',
  };

  it('throws AiConfigError (never a fabricated score) when no provider is configured', async () => {
    delete process.env.AI_PROVIDER;
    await expect(evaluateResume(resumeParams)).rejects.toThrow(AiConfigError);
  });

  it('throws AiGenerationError when the model returns JSON failing schema validation', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ overallScore: 'nope' }) } }] }),
      })
    );
    await expect(evaluateResume(resumeParams)).rejects.toThrow(AiGenerationError);
  });

  it('evaluates a resume via OpenAI', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(wellFormedResumeResult) } }] }),
      })
    );
    const result = await evaluateResume(resumeParams);
    expect(result.overallScore).toBe(8.5);
    expect(result.missingSkills).toEqual(['Terraform']);
  });

  it('evaluates a resume via Anthropic', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: JSON.stringify(wellFormedResumeResult) }] }),
      })
    );
    const result = await evaluateResume(resumeParams);
    expect(result.recommendation).toBe('Strong match — advance to interview');
  });

  it('evaluates a resume via Gemini', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(wellFormedResumeResult) }] } }],
        }),
      })
    );
    const result = await evaluateResume(resumeParams);
    expect(result.skillsMatchScore).toBe(9);
  });
});
