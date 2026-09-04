import { db } from '@/lib/db';
import { SCORE_BUCKETS } from '@/lib/scoring';

/**
 * All applications for a job, with just what the ranking/pipeline/analytics
 * views need. Org-scoped by construction — callers must still verify the
 * job itself belongs to the caller's org before calling this (mirrors the
 * pattern in queries/candidates.ts).
 */
export async function getJobApplicationsForReview(orgId: string, jobId: string) {
  return db.application.findMany({
    where: { orgId, jobId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      candidate: { select: { id: true, name: true, email: true } },
      currentStage: { select: { id: true, name: true, color: true, order: true } },
      evaluation: { select: { overallScore: true } },
      resume: {
        select: {
          parseStatus: true,
          resumeEvaluation: { select: { overallScore: true } },
        },
      },
    },
  });
}

export type JobApplicationForReview = Awaited<ReturnType<typeof getJobApplicationsForReview>>[number];

export interface RankedCandidateRow {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  status: string;
  stageName: string | null;
  resumeScore: number | null;
  interviewScore: number | null;
  hasAnyEvaluation: boolean;
}

/**
 * Ranks by the interview evaluation's overallScore — the one "overall
 * score" concept that already exists in this system (Evaluation.overallScore)
 * — rather than inventing a new weighted combination of resume + interview
 * scores. Candidates without an interview evaluation yet are never given a
 * fake score; they're grouped at the end, clearly marked, ordered by
 * resume score if any, then most recent first.
 */
export function rankCandidates(applications: JobApplicationForReview[]): RankedCandidateRow[] {
  const rows: RankedCandidateRow[] = applications.map((app) => ({
    applicationId: app.id,
    candidateId: app.candidate.id,
    candidateName: app.candidate.name,
    status: app.status,
    stageName: app.currentStage?.name ?? null,
    resumeScore: app.resume?.resumeEvaluation?.overallScore ?? null,
    interviewScore: app.evaluation?.overallScore ?? null,
    hasAnyEvaluation: !!app.evaluation || !!app.resume?.resumeEvaluation,
  }));

  return rows.sort((a, b) => {
    if (a.interviewScore !== null && b.interviewScore !== null) return b.interviewScore - a.interviewScore;
    if (a.interviewScore !== null) return -1;
    if (b.interviewScore !== null) return 1;
    if (a.resumeScore !== null && b.resumeScore !== null) return b.resumeScore - a.resumeScore;
    if (a.resumeScore !== null) return -1;
    if (b.resumeScore !== null) return 1;
    return 0;
  });
}

export interface JobAnalytics {
  totalCandidates: number;
  interviewedCandidates: number;
  evaluatedCandidates: number;
  averageInterviewScore: number | null;
  resumesUploaded: number;
  averageResumeScore: number | null;
  scoreDistribution: { range: string; count: number }[];
  stageCounts: { stageName: string; count: number }[];
  // Mirrors the existing org-level dashboard's convention (getDashboardMetrics)
  // of reading these off the "Shortlisted"/"Offer" stage names rather than a
  // dedicated boolean — consistent with how pipeline stages already work
  // elsewhere in this codebase. Since stage names are per-org customizable,
  // this is 0 for an org that renamed or removed that stage, same caveat the
  // existing dashboard already has.
  shortlisted: number;
  offers: number;
}

// Re-exported from job-candidates.ts's original location for backward
// compatibility with existing importers — canonical definition now lives
// in lib/scoring.ts (kept dependency-free so pure aggregation functions
// elsewhere can use it without pulling in `db`).
export { SCORE_BUCKETS } from '@/lib/scoring';

/** Every figure here is a direct count/average over real rows — nothing is estimated or backfilled. */
export function computeJobAnalytics(applications: JobApplicationForReview[]): JobAnalytics {
  const totalCandidates = applications.length;
  const interviewedCandidates = applications.filter((a) => a.status === 'SUBMITTED' || a.status === 'EVALUATED').length;
  const interviewScores = applications.map((a) => a.evaluation?.overallScore).filter((s): s is number => typeof s === 'number');
  const evaluatedCandidates = interviewScores.length;
  const averageInterviewScore = interviewScores.length
    ? interviewScores.reduce((sum, s) => sum + s, 0) / interviewScores.length
    : null;

  const resumeScores = applications
    .map((a) => a.resume?.resumeEvaluation?.overallScore)
    .filter((s): s is number => typeof s === 'number');
  const resumesUploaded = applications.filter((a) => !!a.resume).length;
  const averageResumeScore = resumeScores.length
    ? resumeScores.reduce((sum, s) => sum + s, 0) / resumeScores.length
    : null;

  const scoreDistribution = SCORE_BUCKETS.map(([min, max, label]) => ({
    range: label,
    count: interviewScores.filter((s) => s >= min && s < max).length,
  }));

  const stageCountMap = new Map<string, number>();
  for (const app of applications) {
    const key = app.currentStage?.name ?? 'No stage assigned';
    stageCountMap.set(key, (stageCountMap.get(key) ?? 0) + 1);
  }
  const stageCounts = Array.from(stageCountMap.entries()).map(([stageName, count]) => ({ stageName, count }));

  return {
    totalCandidates,
    interviewedCandidates,
    evaluatedCandidates,
    averageInterviewScore,
    resumesUploaded,
    averageResumeScore,
    scoreDistribution,
    stageCounts,
    shortlisted: stageCountMap.get('Shortlisted') ?? 0,
    offers: stageCountMap.get('Offer') ?? 0,
  };
}
