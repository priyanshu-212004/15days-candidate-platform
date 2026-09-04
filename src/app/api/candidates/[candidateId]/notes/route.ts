import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOrgMember, assertOwnership, writeAuditLog, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { noteBodySchema } from '@/lib/validations/pipeline';

interface Params {
  params: { candidateId: string };
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const candidate = await db.candidate.findUnique({ where: { id: params.candidateId } });
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    assertOwnership(candidate.orgId, orgId);

    const body = await req.json().catch(() => null);
    const parsed = noteBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const note = await db.candidateNote.create({
      data: { candidateId: candidate.id, authorId: session.user.id, body: parsed.data.body },
      include: { author: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'NOTE_CREATED',
      resourceType: 'CandidateNote',
      resourceId: note.id,
      metadata: { candidateId: candidate.id },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates/:id/notes POST]', err);
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
