import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { interviewSetupSchema } from '@/lib/validations/interview';

interface Params {
  params: { jobId: string };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgMember('VIEWER');
    const job = await db.job.findFirst({ where: { id: params.jobId, orgId, deletedAt: null } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const interviews = await db.interview.findMany({
      where: { jobId: job.id, orgId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true, applications: true } } },
    });
    return NextResponse.json({ interviews });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/jobs/:id/interviews GET]', err);
    return NextResponse.json({ error: 'Failed to load interviews' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const job = await db.job.findFirst({ where: { id: params.jobId, deletedAt: null } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    assertOwnership(job.orgId, orgId);

    const body = await req.json().catch(() => null);
    const parsed = interviewSetupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const interview = await db.interview.create({
      data: {
        orgId,
        jobId: job.id,
        title: data.title,
        maxAttempts: data.maxAttempts,
        languages: data.languages,
        requireCv: data.requireCv,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdById: session.user.id,
        status: 'DRAFT',
        interviewType: data.interviewType,
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'INTERVIEW_CREATED',
      resourceType: 'Interview',
      resourceId: interview.id,
      metadata: { jobId: job.id, title: interview.title },
    });

    return NextResponse.json({ interview }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/jobs/:id/interviews POST]', err);
    return NextResponse.json({ error: 'Failed to create interview' }, { status: 500 });
  }
}
