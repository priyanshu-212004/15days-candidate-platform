import { describe, it, expect } from 'vitest';
import { computeOrgAnalytics, type AnalyticsApplicationRow } from './analytics-pure';

function app(overrides: Partial<AnalyticsApplicationRow> = {}): AnalyticsApplicationRow {
  return {
    id: 'app-1',
    status: 'SUBMITTED',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    job: { id: 'job-1', title: 'Software Engineer' },
    currentStage: null,
    evaluation: null,
    ...overrides,
  };
}

describe('computeOrgAnalytics — KPIs', () => {
  it('counts totals, active/completed interviews, and stage-based outcomes', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', status: 'IN_PROGRESS' }),
      app({ id: 'b', status: 'SUBMITTED' }),
      app({ id: 'c', status: 'EVALUATED', currentStage: { name: 'Shortlisted' } }),
      app({ id: 'd', status: 'EVALUATED', currentStage: { name: 'Rejected' } }),
      app({ id: 'e', status: 'EVALUATED', currentStage: { name: 'Hired' } }),
    ]);

    expect(result.kpis.totalCandidates).toBe(5);
    expect(result.kpis.activeInterviews).toBe(1);
    expect(result.kpis.completedInterviews).toBe(4); // SUBMITTED + EVALUATED
    expect(result.kpis.shortlisted).toBe(1);
    expect(result.kpis.rejected).toBe(1);
    expect(result.kpis.hired).toBe(1);
  });

  it('computes average evaluation score only from applications that have one', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', evaluation: { overallScore: 8 } }),
      app({ id: 'b', evaluation: { overallScore: 6 } }),
      app({ id: 'c', evaluation: null }),
    ]);
    expect(result.kpis.averageEvaluationScore).toBe(7);
  });

  it('returns null average score when nobody has been evaluated yet (never fabricates a number)', () => {
    const result = computeOrgAnalytics([app({ id: 'a', evaluation: null })]);
    expect(result.kpis.averageEvaluationScore).toBeNull();
  });

  it('computes selection rate as positive-outcome stages over total candidates', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', currentStage: { name: 'Shortlisted' } }),
      app({ id: 'b', currentStage: { name: 'Hired' } }),
      app({ id: 'c', currentStage: { name: 'Rejected' } }),
      app({ id: 'd', currentStage: null }),
    ]);
    expect(result.kpis.selectionRate).toBe(50); // 2 of 4
  });

  it('computes interview completion rate as SUBMITTED+EVALUATED over total', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', status: 'PENDING' }),
      app({ id: 'b', status: 'IN_PROGRESS' }),
      app({ id: 'c', status: 'SUBMITTED' }),
      app({ id: 'd', status: 'EVALUATED' }),
    ]);
    expect(result.kpis.interviewCompletionRate).toBe(50); // 2 of 4
  });

  it('handles an empty application list without dividing by zero', () => {
    const result = computeOrgAnalytics([]);
    expect(result.kpis.totalCandidates).toBe(0);
    expect(result.kpis.selectionRate).toBe(0);
    expect(result.kpis.interviewCompletionRate).toBe(0);
    expect(result.kpis.averageEvaluationScore).toBeNull();
  });
});

describe('computeOrgAnalytics — time series', () => {
  it('groups candidates by calendar day, sorted ascending', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', createdAt: new Date('2026-01-02T10:00:00Z') }),
      app({ id: 'b', createdAt: new Date('2026-01-01T09:00:00Z') }),
      app({ id: 'c', createdAt: new Date('2026-01-01T15:00:00Z') }),
    ]);
    expect(result.candidatesOverTime).toEqual([
      { date: '2026-01-01', count: 2 },
      { date: '2026-01-02', count: 1 },
    ]);
  });

  it('averages evaluation scores per day for the score trend', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', createdAt: new Date('2026-01-01T00:00:00Z'), evaluation: { overallScore: 6 } }),
      app({ id: 'b', createdAt: new Date('2026-01-01T00:00:00Z'), evaluation: { overallScore: 8 } }),
      app({ id: 'c', createdAt: new Date('2026-01-01T00:00:00Z'), evaluation: null }),
    ]);
    expect(result.scoreTrend).toEqual([{ date: '2026-01-01', averageScore: 7 }]);
  });
});

describe('computeOrgAnalytics — by job', () => {
  it('aggregates count, average score, and completion rate per job', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', job: { id: 'job-1', title: 'Engineer' }, status: 'EVALUATED', evaluation: { overallScore: 8 } }),
      app({ id: 'b', job: { id: 'job-1', title: 'Engineer' }, status: 'PENDING', evaluation: null }),
      app({ id: 'c', job: { id: 'job-2', title: 'Designer' }, status: 'SUBMITTED', evaluation: null }),
    ]);

    const engineer = result.jobWisePerformance.find((j) => j.jobId === 'job-1');
    expect(engineer).toMatchObject({ candidates: 2, averageScore: 8, completionRate: 50 });

    const designer = result.jobWisePerformance.find((j) => j.jobId === 'job-2');
    expect(designer).toMatchObject({ candidates: 1, averageScore: null, completionRate: 100 });
  });

  it('sorts applicationsByJob by candidate count, highest first', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', job: { id: 'job-1', title: 'Engineer' } }),
      app({ id: 'b', job: { id: 'job-2', title: 'Designer' } }),
      app({ id: 'c', job: { id: 'job-2', title: 'Designer' } }),
    ]);
    expect(result.applicationsByJob[0]).toMatchObject({ jobId: 'job-2', count: 2 });
  });
});

describe('computeOrgAnalytics — distributions', () => {
  it('buckets evaluation scores into the shared 0-10 ranges', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', evaluation: { overallScore: 1 } }),
      app({ id: 'b', evaluation: { overallScore: 9.5 } }),
    ]);
    expect(result.evaluationScoreDistribution.find((b) => b.range === '0-2')?.count).toBe(1);
    expect(result.evaluationScoreDistribution.find((b) => b.range === '8-10')?.count).toBe(1);
  });

  it('groups candidatesByStage, using "No stage assigned" for null stages', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', currentStage: { name: 'Applied' } }),
      app({ id: 'b', currentStage: null }),
    ]);
    expect(result.candidatesByStage).toEqual(
      expect.arrayContaining([
        { stageName: 'Applied', count: 1 },
        { stageName: 'No stage assigned', count: 1 },
      ])
    );
  });

  it('reports shortlisted vs rejected as a two-slice breakdown', () => {
    const result = computeOrgAnalytics([
      app({ id: 'a', currentStage: { name: 'Shortlisted' } }),
      app({ id: 'b', currentStage: { name: 'Shortlisted' } }),
      app({ id: 'c', currentStage: { name: 'Rejected' } }),
    ]);
    expect(result.shortlistedVsRejected).toEqual([
      { name: 'Shortlisted', value: 2 },
      { name: 'Rejected', value: 1 },
    ]);
  });
});
