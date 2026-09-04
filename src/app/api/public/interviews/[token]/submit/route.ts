import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { getPublicInterviewForSession } from '@/lib/queries/interviews';
import { computeProgress, canSubmit, type CandidateSessionStatus } from '@/lib/candidate-session';
import { writeAuditLog } from '@/lib/authz';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string };
}

export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'candidate-submit',
    identifier: getClientIp(req),
    limit: 10,
    windowSec: 60,
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const application = await resolveCandidateSession(params.token);
  if (!application) {
    return NextResponse.json({ error: 'No active session. Please start the interview again.' }, { status: 401 });
  }

  const interview = await getPublicInterviewForSession(params.token);
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const responses = await db.videoResponse.findMany({
    where: { applicationId: application.id },
    select: { questionId: true },
  });
  const questionIds = interview.questions.map((q) => q.id);
  const answeredIds = new Set(responses.map((r) => r.questionId));
  const progress = computeProgress(
    questionIds,
    questionIds.map((id) => ({ questionId: id, answered: answeredIds.has(id) }))
  );

  const check = canSubmit(application.status as CandidateSessionStatus, progress);

  if (!check.ok) {
    if (check.reason === 'SESSION_CLOSED') {
      return NextResponse.json({ error: 'This interview session is no longer open.' }, { status: 409 });
    }
    return NextResponse.json(
      {
        error: 'Please answer all questions before submitting.',
        progress,
      },
      { status: 422 }
    );
  }

  if (check.alreadySubmitted) {
    // Idempotent replay — same success shape, no duplicate write.
    return NextResponse.json({ submitted: true, submittedAt: application.submittedAt });
  }

  // Server-side enforcement of the recruiter's resume requirement — the
  // candidate UI should already gate on this, but never rely on the
  // frontend alone. We only require that a resume was uploaded, not that
  // extraction/evaluation succeeded — a scanned PDF isn't the candidate's
  // fault and shouldn't block their submission.
  if (interview.requireCv) {
    const resume = await db.resume.findUnique({ where: { applicationId: application.id }, select: { id: true } });
    if (!resume) {
      return NextResponse.json(
        { error: 'Please upload your resume before submitting this interview.' },
        { status: 422 }
      );
    }
  }

  const updated = await db.application.update({
    where: { id: application.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });

  await writeAuditLog({
    orgId: application.orgId,
    action: 'CANDIDATE_SUBMITTED_INTERVIEW',
    resourceType: 'Application',
    resourceId: application.id,
    metadata: { interviewId: interview.id, questionCount: questionIds.length },
  });

  return NextResponse.json({ submitted: true, submittedAt: updated.submittedAt });
}
