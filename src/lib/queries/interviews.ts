import { db } from '@/lib/db';

export async function getInterviewById(orgId: string, interviewId: string) {
  return db.interview.findFirst({
    where: { id: interviewId, orgId },
    include: {
      job: true,
      questions: { orderBy: { order: 'asc' } },
      blueprint: true,
      _count: { select: { applications: true } },
    },
  });
}

/** Fetches only the public-safe fields for the candidate-facing interview link. */
export async function getPublicInterviewByToken(token: string) {
  const interview = await db.interview.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      title: true,
      status: true,
      expiresAt: true,
      maxAttempts: true,
      languages: true,
      requireCv: true,
      interviewType: true,
      job: {
        select: { title: true, location: true, remote: true, employmentType: true },
      },
      questions: {
        orderBy: { order: 'asc' },
        select: { id: true, expectedDurationSec: true, order: true },
      },
      blueprint: { select: { id: true } },
    },
  });
  return interview;
}

/**
 * Same availability-relevant shape as getPublicInterviewByToken, plus the
 * question text/type needed to actually run the interview. Deliberately
 * still excludes evaluationCriteria, category, and aiGenerated — those are
 * recruiter-only and must never reach the candidate.
 */
export async function getPublicInterviewForSession(token: string) {
  const interview = await db.interview.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      orgId: true,
      title: true,
      status: true,
      expiresAt: true,
      maxAttempts: true,
      languages: true,
      requireCv: true,
      interviewType: true,
      job: { select: { title: true } },
      questions: {
        orderBy: { order: 'asc' },
        select: { id: true, text: true, type: true, expectedDurationSec: true, order: true, answerType: true },
      },
      blueprint: true,
    },
  });
  return interview;
}
