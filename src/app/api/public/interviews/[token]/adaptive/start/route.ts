import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getOrCreateSession, startFirstTurn, insertFallbackTurn, AiConfigError, AiGenerationError } from '@/lib/adaptive-session';
import { checkElapsedTime } from '@/lib/interview-engine-rules';

interface Params {
  params: { token: string };
}

export async function POST(req: Request, { params }: Params) {
  const rateLimit = await checkRateLimit({
    bucket: 'adaptive-start',
    identifier: `${getClientIp(req)}:${params.token}`,
    limit: 20,
    windowSec: 60,
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const application = await resolveCandidateSession(params.token);
  if (!application) return NextResponse.json({ error: 'Session not found' }, { status: 401 });
  if (application.interview.interviewType !== 'ADAPTIVE_VOICE') {
    return NextResponse.json({ error: 'This interview is not an adaptive voice interview' }, { status: 409 });
  }
  if (application.status === 'SUBMITTED' || application.status === 'EVALUATED') {
    return NextResponse.json({ error: 'This interview has already been submitted' }, { status: 409 });
  }

  const interview = await db.interview.findUnique({
    where: { id: application.interview.id },
    include: { blueprint: true, job: { select: { title: true } } },
  });
  if (!interview?.blueprint) {
    return NextResponse.json({ error: 'This interview has no evaluation blueprint configured' }, { status: 500 });
  }

  if (application.status === 'PENDING') {
    await db.application.update({ where: { id: application.id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
  }

  const session = await getOrCreateSession(application.id, interview.blueprint);

  // Resume-after-refresh: if there's already an unanswered turn, return it
  // as-is rather than generating a new question or re-calling the AI.
  const lastTurn = session.turns[session.turns.length - 1];
  if (lastTurn && !lastTurn.answeredAt) {
    return NextResponse.json({
      sessionStatus: session.status,
      turn: {
        id: lastTurn.id,
        turnNumber: lastTurn.turnNumber,
        topic: lastTurn.topic,
        question: lastTurn.question,
      },
      elapsedSec: checkElapsedTime(session.startedAt, new Date(), {
        durationTargetMin: interview.blueprint.durationTargetMin,
        durationMinMin: interview.blueprint.durationMinMin,
        durationMaxMin: interview.blueprint.durationMaxMin,
        graceSeconds: interview.blueprint.graceSeconds,
      }).elapsedSec,
      targetSec: interview.blueprint.durationTargetMin * 60,
      maxSec: interview.blueprint.durationMaxMin * 60,
    });
  }

  if (session.status === 'COMPLETED') {
    return NextResponse.json({ sessionStatus: 'COMPLETED', turn: null });
  }

  try {
    const outcome = await startFirstTurn(session, interview.blueprint, interview.job.title, {
      interviewId: interview.id,
      applicationId: application.id,
    });
    return NextResponse.json({
      sessionStatus: outcome.session.status,
      turn: outcome.turn,
      elapsedSec: 0,
      targetSec: interview.blueprint.durationTargetMin * 60,
      maxSec: interview.blueprint.durationMaxMin * 60,
    });
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: 'AI interview provider is not configured yet.' }, { status: 503 });
    }
    if (err instanceof AiGenerationError) {
      // First question failed — fall back rather than stranding the candidate on a blank screen.
      const turn = await insertFallbackTurn(session);
      return NextResponse.json({
        sessionStatus: 'IN_PROGRESS',
        turn,
        elapsedSec: 0,
        targetSec: interview.blueprint.durationTargetMin * 60,
        maxSec: interview.blueprint.durationMaxMin * 60,
        degraded: true,
      });
    }
    console.error('[api/public/interviews/:token/adaptive/start POST]', err);
    return NextResponse.json({ error: 'Failed to start the interview' }, { status: 500 });
  }
}
