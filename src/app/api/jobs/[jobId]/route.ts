import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { jobUpdateSchema } from '@/lib/validations/job';

interface Params {
  params: { jobId: string };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgMember('VIEWER');
    const job = await db.job.findFirst({
      where: { id: params.jobId, orgId, deletedAt: null },
      include: {
        _count: { select: { applications: true, interviews: true } },
        interviews: {
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { questions: true, applications: true } } },
        },
      },
    });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/jobs/:id GET]', err);
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const existing = await db.job.findFirst({ where: { id: params.jobId, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    assertOwnership(existing.orgId, orgId);

    const body = await req.json().catch(() => null);
    const parsed = jobUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const data = parsed.data;
    const job = await db.job.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.requirements !== undefined ? { requirements: data.requirements } : {}),
        ...(data.skills !== undefined ? { skills: data.skills } : {}),
        ...(data.experienceLevel !== undefined ? { experienceLevel: data.experienceLevel || null } : {}),
        ...(data.location !== undefined ? { location: data.location || null } : {}),
        ...(data.remote !== undefined ? { remote: data.remote } : {}),
        ...(data.employmentType !== undefined ? { employmentType: data.employmentType } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'JOB_UPDATED',
      resourceType: 'Job',
      resourceId: job.id,
      metadata: { changedFields: Object.keys(data) },
    });

    return NextResponse.json({ job });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/jobs/:id PATCH]', err);
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
  }
}

// Soft-archives the job rather than hard-deleting it — jobs may already have
// interviews/applications attached, and recruiters expect archived jobs to
// remain visible in history, not disappear.
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('ADMIN');

    const existing = await db.job.findFirst({ where: { id: params.jobId, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    assertOwnership(existing.orgId, orgId);

    const job = await db.job.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED' },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'JOB_ARCHIVED',
      resourceType: 'Job',
      resourceId: job.id,
    });

    return NextResponse.json({ job });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/jobs/:id DELETE]', err);
    return NextResponse.json({ error: 'Failed to archive job' }, { status: 500 });
  }
}
