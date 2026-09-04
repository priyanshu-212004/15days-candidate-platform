import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';

export async function GET() {
  try {
    const { session } = await requireCandidateSession();

    // A candidate may be linked to more than one org-scoped Candidate row
    // (one per organization they've applied to — see the Phase 5 linking
    // design) — applications across all of them belong to this session.
    const applications = await db.application.findMany({
      where: { candidate: { userId: session.user.id } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        updatedAt: true,
        job: { select: { id: true, title: true, org: { select: { name: true } } } },
        currentStage: { select: { name: true } },
      },
    });

    return NextResponse.json({ applications });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/applications GET]', err);
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 });
  }
}
