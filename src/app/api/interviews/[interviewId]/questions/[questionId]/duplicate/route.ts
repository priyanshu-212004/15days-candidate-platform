import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requireOrgMember, assertOwnership, writeAuditLog, UnauthorizedError, ForbiddenError } from '@/lib/authz';

interface Params {
  params: { interviewId: string; questionId: string };
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const question = await db.interviewQuestion.findUnique({
      where: { id: params.questionId },
      include: { interview: true },
    });
    if (!question || question.interviewId !== params.interviewId) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }
    assertOwnership(question.interview.orgId, orgId);
    if (question.interview.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Questions can only be duplicated while the interview is a draft' }, { status: 409 });
    }

    const duplicate = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Shift every question after this one down by one to make room.
      await tx.interviewQuestion.updateMany({
        where: { interviewId: question.interviewId, order: { gt: question.order } },
        data: { order: { increment: 1 } },
      });
      return tx.interviewQuestion.create({
        data: {
          interviewId: question.interviewId,
          text: question.text,
          type: question.type,
          category: question.category,
          difficulty: question.difficulty,
          expectedDurationSec: question.expectedDurationSec,
          evaluationCriteria: question.evaluationCriteria,
          answerType: question.answerType,
          order: question.order + 1,
          aiGenerated: false,
        },
      });
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'QUESTION_UPDATED',
      resourceType: 'InterviewQuestion',
      resourceId: duplicate.id,
      metadata: { action: 'duplicated_from', sourceQuestionId: question.id },
    });

    return NextResponse.json({ question: duplicate }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/questions/:qid/duplicate POST]', err);
    return NextResponse.json({ error: 'Failed to duplicate question' }, { status: 500 });
  }
}
