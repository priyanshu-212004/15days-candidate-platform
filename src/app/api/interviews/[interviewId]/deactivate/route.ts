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

    const interview = await db.interview.findUnique({ where: { id: params.interviewId } });
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(interview.orgId, orgId);

    if (interview.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Cannot deactivate an interview in ${interview.status} status` }, { status: 409 });
    }

    const updated = await db.interview.update({
      where: { id: interview.id },
      data: { status: 'PAUSED' },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'INTERVIEW_DEACTIVATED',
      resourceType: 'Interview',
      resourceId: interview.id,
    });

    return NextResponse.json({ interview: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/deactivate POST]', err);
    return NextResponse.json({ error: 'Failed to deactivate interview' }, { status: 500 });
  }
}
