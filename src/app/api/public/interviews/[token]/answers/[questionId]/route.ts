import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { answerTextSchema } from '@/lib/validations/candidate';
import { canModifySession } from '@/lib/candidate-session';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string; questionId: string };
}

export async function PUT(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'candidate-answer',
    identifier: getClientIp(req),
    limit: 120,
    windowSec: 60,
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const application = await resolveCandidateSession(params.token);
  if (!application) {
    return NextResponse.json({ error: 'No active session. Please start the interview again.' }, { status: 401 });
  }
  if (!canModifySession(application.status)) {
    return NextResponse.json({ error: 'This interview has already been submitted and cannot be changed.' }, { status: 409 });
  }

  const question = await db.interviewQuestion.findFirst({
    where: { id: params.questionId, interviewId: application.interviewId },
    select: { id: true, answerType: true },
  });
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  // The recruiter chose the answer type for this question — never the
  // candidate. Reject a text submission for a question that requires video,
  // even though the UI should never present this option in the first place.
  if (question.answerType !== 'TEXT') {
    return NextResponse.json(
      { error: 'This question requires a video answer, not text.' },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = answerTextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your answer', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const saved = await db.videoResponse.upsert({
    where: { applicationId_questionId: { applicationId: application.id, questionId: params.questionId } },
    update: { answerType: 'TEXT', answerText: parsed.data.text, storageKey: null },
    create: {
      applicationId: application.id,
      questionId: params.questionId,
      answerType: 'TEXT',
      answerText: parsed.data.text,
    },
    select: { id: true, updatedAt: true },
  });

  return NextResponse.json({ saved: true, updatedAt: saved.updatedAt });
}
