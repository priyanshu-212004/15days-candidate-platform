import { describe, it, expect } from 'vitest';
import { rankCandidates, computeJobAnalytics, type JobApplicationForReview } from './job-candidates';

function app(overrides: Partial<JobApplicationForReview> = {}): JobApplicationForReview {
  return {
    id: 'app-1',
    status: 'SUBMITTED',
    submittedAt: new Date(),
    candidate: { id: 'cand-1', name: 'Amara Chen', email: 'amara@example.com' },
    currentStage: null,
    evaluation: null,
    resume: null,
    ...overrides,
  } as JobApplicationForReview;
}

describe('rankCandidates', () => {
  it('sorts candidates with an interview score highest-first', () => {
    const apps = [
      app({ id: 'a', evaluation: { overallScore: 6 } }),
      app({ id: 'b', evaluation: { overallScore: 9 } }),
      app({ id: 'c', evaluation: { overallScore: 7.5 } }),
    ];
    const ranked = rankCandidates(apps);
    expect(ranked.map((r) => r.applicationId)).toEqual(['b', 'c', 'a']);
  });

  it('puts candidates with no interview score after those with one, ordered by resume score', () => {
    const apps = [
      app({ id: 'no-eval-low-resume', evaluation: null, resume: { parseStatus: 'COMPLETED', resumeEvaluation: { overallScore: 3 } } }),
      app({ id: 'has-eval', evaluation: { overallScore: 5 } }),
      app({ id: 'no-eval-high-resume', evaluation: null, resume: { parseStatus: 'COMPLETED', resumeEvaluation: { overallScore: 8 } } }),
    ];
    const ranked = rankCandidates(apps);
    expect(ranked.map((r) => r.applicationId)).toEqual(['has-eval', 'no-eval-high-resume', 'no-eval-low-resume']);
  });

  it('never assigns a fake score to an unevaluated candidate', () => {
    const apps = [app({ id: 'a', evaluation: null, resume: null })];
    const ranked = rankCandidates(apps);
    expect(ranked[0]!.interviewScore).toBeNull();
    expect(ranked[0]!.resumeScore).toBeNull();
    expect(ranked[0]!.hasAnyEvaluation).toBe(false);
  });

  it('marks hasAnyEvaluation true when only a resume evaluation exists', () => {
    const apps = [app({ id: 'a', evaluation: null, resume: { parseStatus: 'COMPLETED', resumeEvaluation: { overallScore: 6 } } })];
    const ranked = rankCandidates(apps);
    expect(ranked[0]!.hasAnyEvaluation).toBe(true);
  });
});

describe('computeJobAnalytics', () => {
  it('counts total, interviewed, and evaluated candidates from real rows only', () => {
    const apps = [
      app({ id: 'a', status: 'PENDING', evaluation: null }),
      app({ id: 'b', status: 'SUBMITTED', evaluation: null }),
      app({ id: 'c', status: 'EVALUATED', evaluation: { overallScore: 8 } }),
    ];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.totalCandidates).toBe(3);
    expect(analytics.interviewedCandidates).toBe(2);
    expect(analytics.evaluatedCandidates).toBe(1);
  });

  it('returns null average score rather than fabricating one when nobody has been evaluated', () => {
    const apps = [app({ id: 'a', evaluation: null })];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.averageInterviewScore).toBeNull();
    expect(analytics.averageResumeScore).toBeNull();
  });

  it('computes a correct average interview score', () => {
    const apps = [
      app({ id: 'a', evaluation: { overallScore: 6 } }),
      app({ id: 'b', evaluation: { overallScore: 8 } }),
    ];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.averageInterviewScore).toBe(7);
  });

  it('buckets score distribution correctly', () => {
    const apps = [
      app({ id: 'a', evaluation: { overallScore: 1 } }),
      app({ id: 'b', evaluation: { overallScore: 5 } }),
      app({ id: 'c', evaluation: { overallScore: 9.5 } }),
    ];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.scoreDistribution.find((b) => b.range === '0-2')?.count).toBe(1);
    expect(analytics.scoreDistribution.find((b) => b.range === '4-6')?.count).toBe(1);
    expect(analytics.scoreDistribution.find((b) => b.range === '8-10')?.count).toBe(1);
  });

  it('counts resumes uploaded independent of evaluation status', () => {
    const apps = [
      app({ id: 'a', resume: { parseStatus: 'FAILED', resumeEvaluation: null } }),
      app({ id: 'b', resume: null }),
    ];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.resumesUploaded).toBe(1);
  });

  it('groups stage counts, including a real bucket for applications with no stage assigned', () => {
    const apps = [
      app({ id: 'a', currentStage: { id: 's1', name: 'Screening', color: null, order: 0 } }),
      app({ id: 'b', currentStage: { id: 's1', name: 'Screening', color: null, order: 0 } }),
      app({ id: 'c', currentStage: null }),
    ];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.stageCounts).toEqual(
      expect.arrayContaining([
        { stageName: 'Screening', count: 2 },
        { stageName: 'No stage assigned', count: 1 },
      ])
    );
  });

  it('derives shortlisted/offers from the Shortlisted/Offer stage names, matching the existing dashboard convention', () => {
    const apps = [
      app({ id: 'a', currentStage: { id: 's1', name: 'Shortlisted', color: null, order: 3 } }),
      app({ id: 'b', currentStage: { id: 's1', name: 'Shortlisted', color: null, order: 3 } }),
      app({ id: 'c', currentStage: { id: 's2', name: 'Offer', color: null, order: 5 } }),
      app({ id: 'd', currentStage: { id: 's3', name: 'Applied', color: null, order: 0 } }),
    ];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.shortlisted).toBe(2);
    expect(analytics.offers).toBe(1);
  });

  it('returns zero shortlisted/offers rather than guessing when those stages do not exist for this org', () => {
    const apps = [app({ id: 'a', currentStage: { id: 's1', name: 'Custom Stage', color: null, order: 0 } })];
    const analytics = computeJobAnalytics(apps);
    expect(analytics.shortlisted).toBe(0);
    expect(analytics.offers).toBe(0);
  });
});
