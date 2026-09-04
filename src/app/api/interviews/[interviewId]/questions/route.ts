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
import { questionCreateSchema } from '@/lib/validations/interview';

interface Params {
  params: { interviewId: string };
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const interview = await db.interview.findUnique({ where: { id: params.interviewId } });
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(interview.orgId, orgId);
    if (interview.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Questions can only be edited while the interview is a draft' }, { status: 409 });
    }

    const body = await req.json().catch(() => null);
    const parsed = questionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const question = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const maxOrder = await tx.interviewQuestion.aggregate({
        where: { interviewId: interview.id },
        _max: { order: true },
      });
      return tx.interviewQuestion.create({
        data: {
          interviewId: interview.id,
          text: data.text,
          type: data.type,
          category: data.category || null,
          difficulty: data.difficulty,
          expectedDurationSec: data.expectedDurationSec,
          evaluationCriteria: data.evaluationCriteria,
          answerType: data.answerType,
          order: (maxOrder._max.order ?? -1) + 1,
          aiGenerated: false,
        },
      });
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'QUESTION_UPDATED',
      resourceType: 'InterviewQuestion',
      resourceId: question.id,
      metadata: { interviewId: interview.id, action: 'created_manually' },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/questions POST]', err);
    return NextResponse.json({ error: 'Failed to add question' }, { status: 500 });
  }
}
