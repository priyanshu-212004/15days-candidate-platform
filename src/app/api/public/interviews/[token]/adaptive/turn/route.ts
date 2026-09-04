import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import {
  processAnswer,
  insertFallbackTurn,
  finalizeSession,
  AiConfigError,
  AiGenerationError,
} from '@/lib/adaptive-session';

interface Params {
  params: { token: string };
}

const turnBodySchema = z.object({
  turnId: z.string().uuid(),
  // Candidate's speech, already converted to text by browser STT. The
  // server never receives or trusts raw audio/scores from the client —
  // only this transcript, same trust boundary as the existing typed-answer
  // path for STATIC interviews.
  answerText: z.string().trim().min(1).max(6000),
});

export async function POST(req: Request, { params }: Params) {
  const rateLimit = await checkRateLimit({
    bucket: 'adaptive-turn',
    identifier: `${getClientIp(req)}:${params.token}`,
    limit: 120,
    windowSec: 60,
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const application = await resolveCandidateSession(params.token);
  if (!application) return NextResponse.json({ error: 'Session not found' }, { status: 401 });
  if (application.interview.interviewType !== 'ADAPTIVE_VOICE') {
    return NextResponse.json({ error: 'This interview is not an adaptive voice interview' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = turnBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const interview = await db.interview.findUnique({
    where: { id: application.interview.id },
    include: { blueprint: true, job: { select: { title: true } } },
  });
  if (!interview?.blueprint) {
    return NextResponse.json({ error: 'This interview has no evaluation blueprint configured' }, { status: 500 });
  }

  const session = await db.interviewSession.findUnique({
    where: { applicationId: application.id },
    include: { turns: { orderBy: { turnNumber: 'asc' } } },
  });
  if (!session) return NextResponse.json({ error: 'Interview session not found — start the interview first' }, { status: 404 });
  if (session.status === 'COMPLETED') {
    return NextResponse.json({ sessionStatus: 'COMPLETED', turn: null });
  }

  // The submitted turnId must belong to this session — a candidate cannot
  // answer an arbitrary turn id, only their own current one (task spec §18).
  const targetTurn = session.turns.find((t: { id: string }) => t.id === parsed.data.turnId);
  if (!targetTurn) {
    return NextResponse.json({ error: 'That question does not belong to your current session' }, { status: 403 });
  }

  try {
    const outcome = await processAnswer(
      session,
      interview.blueprint,
      interview.job.title,
      parsed.data.turnId,
      parsed.data.answerText,
      { interviewId: interview.id, applicationId: application.id }
    );

    if (outcome.ended) {
      const result = await finalizeSession({
        sessionId: outcome.session.id,
        applicationId: application.id,
        interviewId: interview.id,
        jobTitle: interview.job.title,
        candidateName: application.candidate.name ?? 'Candidate',
        blueprint: interview.blueprint,
      });
      return NextResponse.json({
        sessionStatus: 'COMPLETED',
        turn: null,
        endReason: outcome.endReason,
        evaluation: { overallScore: result.evaluation.overallScore, recommendation: result.recommendation },
      });
    }

    return NextResponse.json({ sessionStatus: outcome.session.status, turn: outcome.turn });
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: 'AI interview provider is not configured yet.' }, { status: 503 });
    }
    if (err instanceof AiGenerationError) {
      // The candidate's answer was already saved (processAnswer saves it
      // before calling the AI) — never lose it. Fall back to a safe
      // generic follow-up so the interview keeps moving (task spec §17).
      console.error('[adaptive/turn] AI generation failed after answer was saved, using fallback:', err.message);
      const refreshedSession = await db.interviewSession.findUniqueOrThrow({ where: { id: session.id } });
      if (refreshedSession.status === 'COMPLETED') {
        return NextResponse.json({ sessionStatus: 'COMPLETED', turn: null });
      }
      const turn = await insertFallbackTurn(refreshedSession);
      return NextResponse.json({ sessionStatus: 'IN_PROGRESS', turn, degraded: true });
    }
    console.error('[api/public/interviews/:token/adaptive/turn POST]', err);
    return NextResponse.json({ error: 'Failed to process your answer' }, { status: 500 });
  }
}
