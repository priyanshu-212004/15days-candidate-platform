import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOrgMember, writeAuditLog, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { jobCreateSchema } from '@/lib/validations/job';
import { listJobs } from '@/lib/queries/jobs';
import type { JobStatus } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const { orgId } = await requireOrgMember('VIEWER');
    const url = new URL(req.url);
    const search = url.searchParams.get('search') ?? undefined;
    const statusParam = url.searchParams.get('status') ?? undefined;
    const status =
      statusParam && ['DRAFT', 'OPEN', 'PAUSED', 'ARCHIVED'].includes(statusParam)
        ? (statusParam as JobStatus)
        : undefined;

    const jobs = await listJobs({ orgId, search, status });
    return NextResponse.json({ jobs });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/jobs GET]', err);
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const body = await req.json().catch(() => null);
    const parsed = jobCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const data = parsed.data;
    const job = await db.job.create({
      data: {
        orgId,
        title: data.title,
        description: data.description,
        requirements: data.requirements,
        skills: data.skills,
        experienceLevel: data.experienceLevel || null,
        location: data.location || null,
        remote: data.remote,
        employmentType: data.employmentType,
        status: data.status,
        createdById: session.user.id,
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'JOB_CREATED',
      resourceType: 'Job',
      resourceId: job.id,
      metadata: { title: job.title, status: job.status },
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/jobs POST]', err);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}
