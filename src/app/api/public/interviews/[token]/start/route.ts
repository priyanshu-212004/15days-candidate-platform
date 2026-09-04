import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPublicInterviewForSession } from '@/lib/queries/interviews';
import { evaluateInterviewAvailability } from '@/lib/interview-availability';
import { candidateInfoSchema } from '@/lib/validations/candidate';
import { setSessionCookie } from '@/lib/candidate-session-cookie';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string };
}

// Public, unauthenticated by design — see src/middleware.ts. Never returns
// orgId, candidateId, applicationId, or any other internal database id.
export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'candidate-start',
    identifier: getClientIp(req),
    limit: 10,
    windowSec: 60,
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const interview = await getPublicInterviewForSession(params.token);
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
    const statusCode = availability.reason === 'NOT_FOUND' ? 404 : 410;
    return NextResponse.json({ error: 'This interview is not available' }, { status: statusCode });
  }
  const safeInterview = interview!;

  const body = await req.json().catch(() => null);
  const parsed = candidateInfoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your details', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }
  const { name, email, phone, preferredLanguage } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const candidate = await db.candidate.upsert({
    where: { orgId_email: { orgId: safeInterview.orgId, email: normalizedEmail } },
    update: { name, phone, preferredLanguage },
    create: { orgId: safeInterview.orgId, email: normalizedEmail, name, phone, preferredLanguage },
  });

  // Find-or-create: reuse an existing open (or already-submitted) session
  // for this candidate + interview instead of creating a new one every time
  // the entry form is resubmitted — this is what prevents a page refresh
  // from spawning duplicate applications.
  let application = await db.application.findFirst({
    where: { orgId: safeInterview.orgId, candidateId: candidate.id, interviewId: safeInterview.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!application) {
    application = await db.application.create({
      data: {
        orgId: safeInterview.orgId,
        candidateId: candidate.id,
        jobId: (await db.interview.findUniqueOrThrow({ where: { id: safeInterview.id }, select: { jobId: true } }))
          .jobId,
        interviewId: safeInterview.id,
        status: 'PENDING',
      },
    });
  }

  if (application.status === 'PENDING') {
    application = await db.application.update({
      where: { id: application.id },
      data: { status: 'IN_PROGRESS', startedAt: application.startedAt ?? new Date() },
    });
  }

  const res = NextResponse.json({
    status: application.status,
    interviewType: safeInterview.interviewType,
    alreadySubmitted: application.status === 'SUBMITTED' || application.status === 'EVALUATED',
  });
  setSessionCookie(res, params.token, application.id);
  return res;
}
