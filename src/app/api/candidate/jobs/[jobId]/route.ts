import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { getMarketplaceJobById, findEligibleInterviewForJob } from '@/lib/queries/candidate-jobs';
import { evaluateInterviewAvailability } from '@/lib/interview-availability';

interface Params {
  params: { jobId: string };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { session } = await requireCandidateSession();

    const job = await getMarketplaceJobById(params.jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const interview = await findEligibleInterviewForJob(job.id);
    const availability = evaluateInterviewAvailability(
      interview
        ? {
            status: interview.status,
            expiresAt: interview.expiresAt,
            questionCount: interview.questions.length,
            interviewType: interview.interviewType,
            hasBlueprint: !!interview.blueprint,
          }
        : null
    );

    // "Already applied" is checked via the org-scoped Candidate linked to
    // this session, not any client-supplied id — a candidate with no
    // linked Candidate row for this org has definitely not applied here.
    const candidate = await db.candidate.findFirst({
      where: { orgId: job.orgId, userId: session.user.id },
      select: { id: true },
    });
    const existingApplication = candidate
      ? await db.application.findFirst({
          where: { orgId: job.orgId, jobId: job.id, candidateId: candidate.id },
          select: { id: true },
        })
      : null;

    return NextResponse.json({
      job,
      canApply: availability.available && !existingApplication,
      alreadyApplied: !!existingApplication,
      applicationId: existingApplication?.id ?? null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/jobs/[jobId] GET]', err);
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 });
  }
}
