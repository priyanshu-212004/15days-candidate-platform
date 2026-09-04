import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { questionReorderSchema } from '@/lib/validations/interview';
import { isValidReorderPermutation } from '@/lib/question-ordering';

interface Params {
  params: { interviewId: string };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const interview = await db.interview.findUnique({ where: { id: params.interviewId } });
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(interview.orgId, orgId);
    if (interview.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Questions can only be reordered while the interview is a draft' }, { status: 409 });
    }

    const body = await req.json().catch(() => null);
    const parsed = questionReorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const existingQuestions = await db.interviewQuestion.findMany({
      where: { interviewId: interview.id },
      select: { id: true },
    });
    const requestedIds = parsed.data.order;

    // Reject silently-partial or foreign-id reorders — the new order must be
    // a complete permutation of this interview's own questions.
    if (!isValidReorderPermutation(existingQuestions.map((q: (typeof existingQuestions)[number]) => q.id), requestedIds)) {
      return NextResponse.json(
        { error: 'The reorder list must include exactly this interview\u2019s questions, each once.' },
        { status: 422 }
      );
    }

    await db.$transaction(
      requestedIds.map((id, index) =>
        db.interviewQuestion.update({ where: { id }, data: { order: index } })
      )
    );

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'QUESTION_UPDATED',
      resourceType: 'Interview',
      resourceId: interview.id,
      metadata: { action: 'reordered', count: requestedIds.length },
    });

    const questions = await db.interviewQuestion.findMany({
      where: { interviewId: interview.id },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json({ questions });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/questions/reorder PATCH]', err);
    return NextResponse.json({ error: 'Failed to reorder questions' }, { status: 500 });
  }
}
