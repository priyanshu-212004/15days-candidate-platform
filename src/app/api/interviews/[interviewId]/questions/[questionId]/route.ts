import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { questionUpdateSchema } from '@/lib/validations/interview';

interface Params {
  params: { interviewId: string; questionId: string };
}

async function loadScopedQuestion(orgId: string, interviewId: string, questionId: string) {
  const question = await db.interviewQuestion.findUnique({
    where: { id: questionId },
    include: { interview: true },
  });
  if (!question || question.interviewId !== interviewId) return null;
  assertOwnership(question.interview.orgId, orgId);
  return question;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');
    const question = await loadScopedQuestion(orgId, params.interviewId, params.questionId);
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    if (question.interview.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Questions can only be edited while the interview is a draft' }, { status: 409 });
    }

    const body = await req.json().catch(() => null);
    const parsed = questionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const updated = await db.interviewQuestion.update({
      where: { id: question.id },
      data: {
        ...(data.text !== undefined ? { text: data.text } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.category !== undefined ? { category: data.category || null } : {}),
        ...(data.difficulty !== undefined ? { difficulty: data.difficulty } : {}),
        ...(data.expectedDurationSec !== undefined ? { expectedDurationSec: data.expectedDurationSec } : {}),
        ...(data.evaluationCriteria !== undefined ? { evaluationCriteria: data.evaluationCriteria } : {}),
        ...(data.answerType !== undefined ? { answerType: data.answerType } : {}),
        // Editing text/criteria manually means it's no longer a pure AI output.
        aiGenerated: false,
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'QUESTION_UPDATED',
      resourceType: 'InterviewQuestion',
      resourceId: updated.id,
      metadata: { changedFields: Object.keys(data) },
    });

    return NextResponse.json({ question: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/questions/:qid PATCH]', err);
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');
    const question = await loadScopedQuestion(orgId, params.interviewId, params.questionId);
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    if (question.interview.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Questions can only be deleted while the interview is a draft' }, { status: 409 });
    }

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.interviewQuestion.delete({ where: { id: question.id } });
      // Renumber remaining questions so ordering stays contiguous and deterministic.
      const remaining = await tx.interviewQuestion.findMany({
        where: { interviewId: question.interviewId },
        orderBy: { order: 'asc' },
      });
      await Promise.all(
        remaining.map((q: (typeof remaining)[number], index: number) =>
          q.order === index ? null : tx.interviewQuestion.update({ where: { id: q.id }, data: { order: index } })
        )
      );
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'QUESTION_DELETED',
      resourceType: 'InterviewQuestion',
      resourceId: question.id,
      metadata: { interviewId: question.interviewId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/questions/:qid DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete question' }, { status: 500 });
  }
}
