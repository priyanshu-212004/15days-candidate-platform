import { NextResponse } from 'next/server';
import { getPublicInterviewByToken } from '@/lib/queries/interviews';
import { evaluateInterviewAvailability } from '@/lib/interview-availability';

interface Params {
  params: { token: string };
}

// Public, unauthenticated by design (see src/middleware.ts) — candidates never
// log in. Never return orgId, candidateId, internal database ids beyond the
// question ids needed to render the flow, or recruiter information.
export async function GET(_req: Request, { params }: Params) {
  const interview = await getPublicInterviewByToken(params.token);

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
    return NextResponse.json({ available: false, reason: availability.reason }, { status: statusCode });
  }

  // availability.available === true implies interview is non-null
  const safeInterview = interview!;
  const isAdaptive = safeInterview.interviewType === 'ADAPTIVE_VOICE';
  const totalDurationSec = isAdaptive
    ? undefined
    : safeInterview.questions.reduce(
        (sum: number, q: (typeof safeInterview.questions)[number]) => sum + q.expectedDurationSec,
        0
      );

  return NextResponse.json({
    available: true,
    interview: {
      title: safeInterview.title,
      jobTitle: safeInterview.job.title,
      location: safeInterview.job.location,
      remote: safeInterview.job.remote,
      employmentType: safeInterview.job.employmentType,
      interviewType: safeInterview.interviewType,
      questionCount: isAdaptive ? null : safeInterview.questions.length,
      estimatedDurationSec: totalDurationSec ?? null,
      languages: safeInterview.languages,
      requireCv: safeInterview.requireCv,
      maxAttempts: safeInterview.maxAttempts,
    },
  });
}
