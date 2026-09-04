import { SCORE_BUCKETS, SUCCESSFUL_SCORE_THRESHOLD } from '@/lib/scoring';

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface AnalyticsApplicationRow {
  id: string;
  status: string;
  createdAt: Date;
  job: { id: string; title: string } | null;
  currentStage: { name: string } | null;
  evaluation: { overallScore: number } | null;
}

/**
 * Pure aggregation over an already-fetched list of applications — mirrors
 * the computeJobAnalytics(applications) pattern in job-candidates.ts so
 * this can be unit tested the same way, without a database.
 */
export function computeOrgAnalytics(applications: AnalyticsApplicationRow[]) {
  const totalCandidates = applications.length;
  const activeInterviews = applications.filter((a) => a.status === 'IN_PROGRESS').length;
  const completedInterviews = applications.filter((a) => a.status === 'SUBMITTED' || a.status === 'EVALUATED').length;
  const shortlisted = applications.filter((a) => a.currentStage?.name === 'Shortlisted').length;
  const rejected = applications.filter((a) => a.currentStage?.name === 'Rejected').length;
  const hired = applications.filter((a) => a.currentStage?.name === 'Hired').length;

  const scores = applications.map((a) => a.evaluation?.overallScore).filter((s): s is number => typeof s === 'number');
  const averageEvaluationScore = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
  const successfulCount = scores.filter((s) => s >= SUCCESSFUL_SCORE_THRESHOLD).length;

  // "Selection rate" = candidates who progressed past a bare application
  // into a positive outcome (Shortlisted, Offer, or Hired) out of everyone
  // who applied — the closest real, derivable analogue to a hiring funnel
  // conversion rate given the existing stage model.
  const positiveOutcomeStages = new Set(['Shortlisted', 'Offer', 'Hired']);
  const positiveOutcomes = applications.filter((a) => a.currentStage && positiveOutcomeStages.has(a.currentStage.name)).length;
  const selectionRate = totalCandidates > 0 ? (positiveOutcomes / totalCandidates) * 100 : 0;
  const interviewCompletionRate = totalCandidates > 0 ? (completedInterviews / totalCandidates) * 100 : 0;

  // Candidates over time — one point per calendar day an application was created.
  const byDay = new Map<string, number>();
  for (const app of applications) {
    const key = dayKey(app.createdAt);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const candidatesOverTime = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Evaluation-score trend over the same days, averaged per day.
  const scoreSumByDay = new Map<string, { sum: number; count: number }>();
  for (const app of applications) {
    if (typeof app.evaluation?.overallScore !== 'number') continue;
    const key = dayKey(app.createdAt);
    const entry = scoreSumByDay.get(key) ?? { sum: 0, count: 0 };
    entry.sum += app.evaluation.overallScore;
    entry.count += 1;
    scoreSumByDay.set(key, entry);
  }
  const scoreTrend = Array.from(scoreSumByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({ date, averageScore: Math.round((sum / count) * 100) / 100 }));

  // Applications by job + job-wise performance (candidates, avg score, completion rate per job).
  const byJob = new Map<string, { jobId: string; jobTitle: string; count: number; scoreSum: number; scoreCount: number; completed: number }>();
  for (const app of applications) {
    if (!app.job) continue;
    const entry = byJob.get(app.job.id) ?? { jobId: app.job.id, jobTitle: app.job.title, count: 0, scoreSum: 0, scoreCount: 0, completed: 0 };
    entry.count += 1;
    if (typeof app.evaluation?.overallScore === 'number') {
      entry.scoreSum += app.evaluation.overallScore;
      entry.scoreCount += 1;
    }
    if (app.status === 'SUBMITTED' || app.status === 'EVALUATED') entry.completed += 1;
    byJob.set(app.job.id, entry);
  }
  const applicationsByJob = Array.from(byJob.values())
    .sort((a, b) => b.count - a.count)
    .map((j) => ({ jobId: j.jobId, jobTitle: j.jobTitle, count: j.count }));
  const jobWisePerformance = Array.from(byJob.values())
    .sort((a, b) => b.count - a.count)
    .map((j) => ({
      jobId: j.jobId,
      jobTitle: j.jobTitle,
      candidates: j.count,
      averageScore: j.scoreCount ? Math.round((j.scoreSum / j.scoreCount) * 100) / 100 : null,
      completionRate: j.count ? Math.round((j.completed / j.count) * 1000) / 10 : 0,
    }));

  const evaluationScoreDistribution = SCORE_BUCKETS.map(([min, max, label]) => ({
    range: label,
    count: scores.filter((s) => s >= min && s < max).length,
  }));

  const stageCountMap = new Map<string, number>();
  for (const app of applications) {
    const key = app.currentStage?.name ?? 'No stage assigned';
    stageCountMap.set(key, (stageCountMap.get(key) ?? 0) + 1);
  }
  const candidatesByStage = Array.from(stageCountMap.entries()).map(([stageName, count]) => ({ stageName, count }));

  return {
    kpis: {
      totalCandidates,
      activeInterviews,
      completedInterviews,
      shortlisted,
      rejected,
      hired,
      averageEvaluationScore,
      selectionRate,
      interviewCompletionRate,
      successfulCount,
    },
    candidatesOverTime,
    scoreTrend,
    applicationsByJob,
    jobWisePerformance,
    evaluationScoreDistribution,
    candidatesByStage,
    shortlistedVsRejected: [
      { name: 'Shortlisted', value: shortlisted },
      { name: 'Rejected', value: rejected },
    ],
  };
}

export type ComputedOrgAnalytics = ReturnType<typeof computeOrgAnalytics>;
