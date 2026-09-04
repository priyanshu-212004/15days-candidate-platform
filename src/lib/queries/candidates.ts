import { db } from '@/lib/db';
import { buildActivityTimeline } from '@/lib/activity-timeline';
import { SUCCESSFUL_SCORE_THRESHOLD } from '@/lib/scoring';
import type { Prisma } from '@prisma/client';

export type InterviewStatusFilter = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED';
export type EvaluationStatusFilter = 'NOT_EVALUATED' | 'EVALUATED' | 'SUCCESSFUL' | 'UNSUCCESSFUL';

// Re-exported for backward compatibility with existing importers —
// canonical definition now lives in lib/scoring.ts (kept dependency-free
// so pure aggregation functions elsewhere can use it without pulling in `db`).
export { SUCCESSFUL_SCORE_THRESHOLD };

export interface ListCandidatesFilters {
  search?: string;
  jobId?: string;
  interviewStatus?: InterviewStatusFilter;
  evaluationStatus?: EvaluationStatusFilter;
}

function evaluationWhereClause(evaluationStatus?: EvaluationStatusFilter): Prisma.ApplicationWhereInput {
  switch (evaluationStatus) {
    case 'NOT_EVALUATED':
      return { evaluation: null };
    case 'EVALUATED':
      return { evaluation: { isNot: null } };
    case 'SUCCESSFUL':
      return { evaluation: { is: { overallScore: { gte: SUCCESSFUL_SCORE_THRESHOLD } } } };
    case 'UNSUCCESSFUL':
      // `is: {...}` alone already requires the relation to exist (it
      // matches against an existing related row), so no separate
      // `isNot: null` is needed — mixing the two in one object doesn't
      // satisfy Prisma's generated relation-filter union type anyway.
      return { evaluation: { is: { overallScore: { lt: SUCCESSFUL_SCORE_THRESHOLD } } } };
    default:
      return {};
  }
}

export async function listCandidates(orgId: string, filters: ListCandidatesFilters = {}) {
  const search = filters.search?.trim();

  // Combined so Job + Interview-status + Evaluation-status all constrain
  // the SAME application, not three independently-matching ones — applied
  // both to decide which candidates qualify (`applications.some`) and to
  // select which application is shown as "latest" for that candidate.
  const applicationWhere: Prisma.ApplicationWhereInput = {
    ...(filters.jobId ? { jobId: filters.jobId } : {}),
    ...(filters.interviewStatus ? { status: filters.interviewStatus } : {}),
    ...evaluationWhereClause(filters.evaluationStatus),
  };
  const hasApplicationFilter = Object.keys(applicationWhere).length > 0;

  const where: Prisma.CandidateWhereInput = {
    orgId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { applications: { some: { job: { title: { contains: search, mode: 'insensitive' as const } } } } },
          ],
        }
      : {}),
    ...(hasApplicationFilter ? { applications: { some: applicationWhere } } : {}),
  };

  return db.candidate.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      applications: {
        where: hasApplicationFilter ? applicationWhere : undefined,
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          job: { select: { title: true } },
          interview: { select: { title: true } },
          evaluation: { select: { overallScore: true } },
          currentStage: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/** Ownership-checked: only ever returns a candidate belonging to the caller's org. */
export async function getCandidateById(orgId: string, candidateId: string) {
  return db.candidate.findFirst({
    where: { id: candidateId, orgId },
    include: {
      // Phase 5: if this Candidate row is linked to a candidate-platform
      // account (Candidate.userId — see prisma/schema.prisma), surface
      // that account's self-maintained profile alongside the existing
      // application data below. Purely additive — every existing field
      // and the `applications` include are untouched, and this is null
      // for the many Candidate rows that were never linked to an account.
      user: {
        select: {
          candidateProfile: {
            include: {
              experience: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] },
              education: { orderBy: { graduationYear: 'desc' } },
            },
          },
        },
      },
      applications: {
        orderBy: { createdAt: 'desc' },
        where: { orgId }, // defense in depth alongside the candidate-level org check above
        include: {
          job: { select: { id: true, title: true } },
          interview: {
            select: {
              id: true,
              title: true,
              interviewType: true,
              questions: { orderBy: { order: 'asc' }, select: { id: true, text: true, type: true, order: true, answerType: true } },
            },
          },
          currentStage: { select: { id: true, name: true } },
          videoResponses: true,
          resume: { include: { resumeEvaluation: true } },
          evaluation: { include: { scores: true } },
          interviewSession: {
            include: { turns: { orderBy: { turnNumber: 'asc' } } },
          },
        },
      },
    },
  });
}

/** Ordered pipeline stages for an org, for the stage-change dropdown. Cheap, read-only, org-scoped. */
export async function listOrgPipelineStages(orgId: string) {
  return db.pipelineStage.findMany({
    where: { orgId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true, order: true, color: true },
  });
}

/** Org-scoped: only ever returns notes for a candidate belonging to the caller's org. */
export async function getCandidateNotes(orgId: string, candidateId: string) {
  return db.candidateNote.findMany({
    where: { candidateId, candidate: { orgId } },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true } } },
  });
}

/** Org-scoped: only ever returns comments for a candidate belonging to the caller's org. */
export async function getCandidateComments(orgId: string, candidateId: string) {
  return db.candidateComment.findMany({
    where: { candidateId, candidate: { orgId } },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true } } },
  });
}

interface ActivityApplicationRow {
  createdAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  job: { title: string };
  evaluation: { status: string; createdAt: Date } | null;
  stageHistory: {
    id: string;
    createdAt: Date;
    note: string | null;
    stage: { name: string };
    movedBy: { name: string } | null;
  }[];
}
interface ActivityNoteRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string };
}
interface ActivityCommentRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string };
}
interface ActivityAuditRow {
  id: string;
  action: string;
  createdAt: Date;
  user: { name: string } | null;
}

/**
 * Assembles the recruiter-facing activity timeline for a candidate from
 * real rows only (stage history, notes, comments, application milestones,
 * evaluation completion, plus audit-log entries for deleted notes/comments,
 * which is the one thing current-state rows can't reconstruct on their
 * own). See buildActivityTimeline for the pure merge/sort logic.
 */
export async function getCandidateActivity(orgId: string, candidateId: string) {
  const candidate = await db.candidate.findFirst({ where: { id: candidateId, orgId }, select: { id: true } });
  if (!candidate) return [];

  const [applications, notes, comments, deletedAudit] = (await Promise.all([
    db.application.findMany({
      where: { candidateId, orgId },
      select: {
        createdAt: true,
        startedAt: true,
        submittedAt: true,
        job: { select: { title: true } },
        evaluation: { select: { status: true, createdAt: true } },
        stageHistory: {
          orderBy: { createdAt: 'asc' },
          include: { stage: { select: { name: true } }, movedBy: { select: { name: true } } },
        },
      },
    }),
    db.candidateNote.findMany({
      where: { candidateId, candidate: { orgId } },
      select: { id: true, createdAt: true, updatedAt: true, author: { select: { name: true } } },
    }),
    db.candidateComment.findMany({
      where: { candidateId, candidate: { orgId } },
      select: { id: true, createdAt: true, updatedAt: true, author: { select: { name: true } } },
    }),
    db.auditLog.findMany({
      where: {
        orgId,
        action: { in: ['NOTE_DELETED', 'COMMENT_DELETED'] },
        metadata: { path: ['candidateId'], equals: candidateId },
      },
      select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
    }),
  ])) as [ActivityApplicationRow[], ActivityNoteRow[], ActivityCommentRow[], ActivityAuditRow[]];

  const stageHistory = applications.flatMap((app: ActivityApplicationRow) =>
    app.stageHistory.map((h, index: number) => ({
      id: h.id,
      stageName: h.stage.name,
      previousStageName: index > 0 ? app.stageHistory[index - 1]!.stage.name : null,
      movedByName: h.movedBy?.name ?? null,
      note: h.note,
      createdAt: h.createdAt,
    }))
  );

  return buildActivityTimeline({
    stageHistory,
    notes: notes.map((n: ActivityNoteRow) => ({ id: n.id, authorName: n.author.name, createdAt: n.createdAt, updatedAt: n.updatedAt })),
    comments: comments.map((c: ActivityCommentRow) => ({ id: c.id, authorName: c.author.name, createdAt: c.createdAt, updatedAt: c.updatedAt })),
    applications: applications.map((app: ActivityApplicationRow) => ({
      jobTitle: app.job.title,
      createdAt: app.createdAt,
      startedAt: app.startedAt,
      submittedAt: app.submittedAt,
      evaluationCompletedAt: app.evaluation?.status === 'COMPLETED' ? app.evaluation.createdAt : null,
    })),
    deletedAudit: deletedAudit.map((d: ActivityAuditRow) => ({
      id: d.id,
      type: d.action as 'NOTE_DELETED' | 'COMMENT_DELETED',
      actorName: d.user?.name ?? null,
      createdAt: d.createdAt,
    })),
  });
}
