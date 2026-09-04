import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';

interface Params {
  params: { applicationId: string };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { session } = await requireCandidateSession();

    const application = await db.application.findUnique({
      where: { id: params.applicationId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        submittedAt: true,
        updatedAt: true,
        candidate: { select: { userId: true } },
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            remote: true,
            employmentType: true,
            org: { select: { name: true } },
          },
        },
        currentStage: { select: { name: true } },
        interview: { select: { interviewType: true } },
        resume: { select: { fileName: true, parseStatus: true } },
        stageHistory: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, createdAt: true, stage: { select: { name: true } } },
        },
      },
    });

    // Ownership check: candidate.userId must match the session, never a
    // client-supplied id. A mismatch (or a nonexistent application) both
    // return the same 404 — no information leak about whether the id
    // belongs to someone else vs. doesn't exist at all.
    if (!application || application.candidate.userId !== session.user.id) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // candidate.userId was only needed for the ownership check above —
    // never include it in the response.
    const { candidate: _omitted, ...safeApplication } = application;
    void _omitted;

    return NextResponse.json({ application: safeApplication });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/applications/[applicationId] GET]', err);
    return NextResponse.json({ error: 'Failed to load application' }, { status: 500 });
  }
}
