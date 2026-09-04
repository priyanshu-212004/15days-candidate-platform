import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { finalizeSession } from '@/lib/adaptive-session';

interface Params {
  params: { token: string };
}

export async function POST(req: Request, { params }: Params) {
  const rateLimit = await checkRateLimit({
    bucket: 'adaptive-finish',
    identifier: `${getClientIp(req)}:${params.token}`,
    limit: 10,
    windowSec: 60,
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const application = await resolveCandidateSession(params.token);
  if (!application) return NextResponse.json({ error: 'Session not found' }, { status: 401 });
  if (application.interview.interviewType !== 'ADAPTIVE_VOICE') {
    return NextResponse.json({ error: 'This interview is not an adaptive voice interview' }, { status: 409 });
  }
  if (application.status === 'SUBMITTED' || application.status === 'EVALUATED') {
    return NextResponse.json({ sessionStatus: 'COMPLETED' });
  }

  const interview = await db.interview.findUnique({
    where: { id: application.interview.id },
    include: { blueprint: true, job: { select: { title: true } } },
  });
  if (!interview?.blueprint) {
    return NextResponse.json({ error: 'This interview has no evaluation blueprint configured' }, { status: 500 });
  }

  const session = await db.interviewSession.findUnique({ where: { applicationId: application.id } });
  if (!session) return NextResponse.json({ error: 'Interview session not found' }, { status: 404 });

  // Idempotent: if it's already evaluated, don't regenerate the evaluation
  // (e.g. duplicate submit from a flaky network / double click).
  const existingEvaluation = await db.evaluation.findUnique({ where: { applicationId: application.id } });
  if (existingEvaluation && existingEvaluation.status === 'COMPLETED') {
    return NextResponse.json({
      sessionStatus: 'COMPLETED',
      evaluation: { overallScore: existingEvaluation.overallScore },
    });
  }

  try {
    const result = await finalizeSession({
      sessionId: session.id,
      applicationId: application.id,
      interviewId: interview.id,
      jobTitle: interview.job.title,
      candidateName: application.candidate.name ?? 'Candidate',
      blueprint: interview.blueprint,
    });
    return NextResponse.json({
      sessionStatus: 'COMPLETED',
      evaluation: { overallScore: result.evaluation.overallScore, recommendation: result.recommendation },
    });
  } catch (err) {
    console.error('[api/public/interviews/:token/adaptive/finish POST]', err);
    // The session itself is already marked ended by finalizeSession's first
    // step even if evaluation generation fails — the candidate is not stuck
    // mid-interview. Report the failure so the client can show a
    // "we'll finish scoring shortly" message rather than a broken loop.
    return NextResponse.json(
      { error: 'Interview ended, but the final evaluation could not be generated yet. It will be retried.' },
      { status: 502 }
    );
  }
}
