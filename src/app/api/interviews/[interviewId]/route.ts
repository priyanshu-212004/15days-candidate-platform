import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { interviewUpdateSchema } from '@/lib/validations/interview';
import { getInterviewById } from '@/lib/queries/interviews';

interface Params {
  params: { interviewId: string };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgMember('VIEWER');
    const interview = await getInterviewById(orgId, params.interviewId);
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    return NextResponse.json({ interview });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id GET]', err);
    return NextResponse.json({ error: 'Failed to load interview' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const existing = await db.interview.findUnique({ where: { id: params.interviewId } });
    if (!existing) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(existing.orgId, orgId);

    const body = await req.json().catch(() => null);
    const parsed = interviewUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const interview = await db.interview.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.maxAttempts !== undefined ? { maxAttempts: data.maxAttempts } : {}),
        ...(data.languages !== undefined ? { languages: data.languages } : {}),
        ...(data.requireCv !== undefined ? { requireCv: data.requireCv } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'INTERVIEW_UPDATED',
      resourceType: 'Interview',
      resourceId: interview.id,
      metadata: { changedFields: Object.keys(data) },
    });

    return NextResponse.json({ interview });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id PATCH]', err);
    return NextResponse.json({ error: 'Failed to update interview' }, { status: 500 });
  }
}
