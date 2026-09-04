import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';

interface Params {
  params: { interviewId: string };
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const interview = await db.interview.findUnique({
      where: { id: params.interviewId },
      include: { questions: true, blueprint: true },
    });
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(interview.orgId, orgId);

    if (interview.status === 'ACTIVE') {
      return NextResponse.json({ interview }); // already published — idempotent
    }
    if (interview.status !== 'DRAFT' && interview.status !== 'PAUSED') {
      return NextResponse.json({ error: `Cannot publish an interview in ${interview.status} status` }, { status: 409 });
    }
    if (interview.interviewType === 'ADAPTIVE_VOICE') {
      if (!interview.blueprint) {
        return NextResponse.json(
          { error: 'Set up the evaluation blueprint before publishing this adaptive interview' },
          { status: 422 }
        );
      }
    } else if (interview.questions.length === 0) {
      return NextResponse.json({ error: 'Add at least one question before publishing' }, { status: 422 });
    }
    if (interview.expiresAt && interview.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Set an expiration date in the future before publishing' }, { status: 422 });
    }

    const updated = await db.interview.update({
      where: { id: interview.id },
      data: { status: 'ACTIVE' },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'INTERVIEW_PUBLISHED',
      resourceType: 'Interview',
      resourceId: interview.id,
      metadata:
        interview.interviewType === 'ADAPTIVE_VOICE'
          ? { interviewType: 'ADAPTIVE_VOICE' }
          : { questionCount: interview.questions.length },
    });

    return NextResponse.json({ interview: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/publish POST]', err);
    return NextResponse.json({ error: 'Failed to publish interview' }, { status: 500 });
  }
}
