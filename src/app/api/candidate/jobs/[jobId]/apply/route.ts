import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { getMarketplaceJobById, findEligibleInterviewForJob } from '@/lib/queries/candidate-jobs';
import { evaluateInterviewAvailability } from '@/lib/interview-availability';
import { resolveCandidateLinkAction } from '@/lib/candidate-application';
import { buildResumeKey, getObjectBuffer, putObjectBuffer, RESUME_EXTENSION_BY_MIME_TYPE } from '@/lib/storage';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { jobId: string };
}

// Copies the candidate's current profile resume into an immutable,
// application-scoped storage object + Resume row. Deliberately a real
// file copy, not a shared storageKey — CandidateProfile's resume key is
// STABLE (overwritten on replace, see buildCandidateResumeKey), so pointing
// an Application's Resume at it directly would mean a later profile resume
// replacement silently changes what an old application's resume looks like.
// This is the "historical resume rule": once attached to an application,
// a resume snapshot never changes again, even if the candidate's profile
// resume does. Failure here is non-fatal — the application still exists
// without a resume attached rather than failing the whole apply flow.
async function attachResumeSnapshot(params: {
  applicationId: string;
  orgId: string;
  resumeStorageKey: string | null;
  resumeFileName: string | null;
  resumeMimeType: string | null;
  resumeSizeBytes: number | null;
  resumeParsedText: string | null;
  resumeParseStatus: string;
  resumeParseError: string | null;
}) {
  if (!params.resumeStorageKey || !params.resumeMimeType) return;

  const buffer = await getObjectBuffer(params.resumeStorageKey);
  if (!buffer) return;

  const ext = RESUME_EXTENSION_BY_MIME_TYPE[params.resumeMimeType] ?? 'pdf';
  const snapshotKey = buildResumeKey({ orgId: params.orgId, applicationId: params.applicationId, ext });
  const copied = await putObjectBuffer({ key: snapshotKey, body: buffer, mimeType: params.resumeMimeType });
  if (!copied) return;

  await db.resume.create({
    data: {
      applicationId: params.applicationId,
      storageKey: snapshotKey,
      fileName: params.resumeFileName ?? 'resume',
      mimeType: params.resumeMimeType,
      sizeBytes: params.resumeSizeBytes ?? buffer.byteLength,
      parsedText: params.resumeParsedText,
      // Cast is safe: resumeParseStatus on CandidateProfile shares the same
      // JobQueueStatus enum as Resume.parseStatus.
      parseStatus: params.resumeParseStatus as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
      parseError: params.resumeParseError,
    },
  });
}

export async function POST(req: Request, { params }: Params) {
  try {
    const rate = await checkRateLimit({
      bucket: 'candidate-apply',
      identifier: getClientIp(req),
      limit: 20,
      windowSec: 60,
    });
    if (!rate.allowed) return rateLimitResponse(rate);

    const { session, profile } = await requireCandidateSession();

    const job = await getMarketplaceJobById(params.jobId);
    if (!job) return NextResponse.json({ error: 'This job is not available' }, { status: 404 });

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
    if (!availability.available) {
      return NextResponse.json({ error: 'This job is not currently accepting applications.' }, { status: 409 });
    }
    const eligibleInterview = interview!;

    const email = session.user.email;
    if (!email) {
      // Should not happen in practice (credentials login always has an
      // email), but Application/Candidate both require one.
      return NextResponse.json({ error: 'Your account has no email on file.' }, { status: 422 });
    }
    const normalizedEmail = email.toLowerCase();

    const existingByEmail = await db.candidate.findUnique({
      where: { orgId_email: { orgId: job.orgId, email: normalizedEmail } },
    });
    const linkAction = resolveCandidateLinkAction(existingByEmail, session.user.id);

    if (linkAction.kind === 'CONFLICT') {
      // Case C — never overwrite another user's candidate record. This
      // means a different account already used this email at this specific
      // organization; the safe response is to refuse, not merge accounts.
      return NextResponse.json(
        { error: 'This email is already associated with a different account at this organization.' },
        { status: 409 }
      );
    }

    const candidateSyncData = {
      name: session.user.name ?? normalizedEmail,
      phone: profile.phone ?? undefined,
      location: profile.location ?? undefined,
    };

    let candidateId: string;
    if (linkAction.kind === 'REUSE') {
      candidateId = linkAction.candidateId;
      await db.candidate.update({ where: { id: candidateId }, data: candidateSyncData });
    } else if (linkAction.kind === 'LINK') {
      candidateId = linkAction.candidateId;
      await db.candidate.update({ where: { id: candidateId }, data: { ...candidateSyncData, userId: session.user.id } });
    } else {
      const created = await db.candidate.create({
        data: { orgId: job.orgId, email: normalizedEmail, userId: session.user.id, ...candidateSyncData },
      });
      candidateId = created.id;
    }

    // Duplicate protection: findFirst-or-create, matching the existing
    // pattern in api/public/interviews/[token]/start/route.ts (which has
    // the same theoretical race under concurrent requests and no DB unique
    // constraint either — see the Phase 5 report for the additive
    // constraint this could use if that's ever worth doing).
    const existingApplication = await db.application.findFirst({
      where: { orgId: job.orgId, jobId: job.id, candidateId },
    });
    if (existingApplication) {
      return NextResponse.json({ error: 'You have already applied to this job.' }, { status: 409 });
    }

    const application = await db.application.create({
      data: {
        orgId: job.orgId,
        candidateId,
        jobId: job.id,
        interviewId: eligibleInterview.id,
        status: 'PENDING',
      },
    });

    await attachResumeSnapshot({
      applicationId: application.id,
      orgId: job.orgId,
      resumeStorageKey: profile.resumeStorageKey,
      resumeFileName: profile.resumeFileName,
      resumeMimeType: profile.resumeMimeType,
      resumeSizeBytes: profile.resumeSizeBytes,
      resumeParsedText: profile.resumeParsedText,
      resumeParseStatus: profile.resumeParseStatus,
      resumeParseError: profile.resumeParseError,
    });

    return NextResponse.json({ application: { id: application.id, status: application.status } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/jobs/[jobId]/apply POST]', err);
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
  }
}
