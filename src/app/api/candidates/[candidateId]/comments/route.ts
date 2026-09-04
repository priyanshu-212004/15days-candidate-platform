import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOrgMember, assertOwnership, writeAuditLog, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { commentBodySchema } from '@/lib/validations/pipeline';

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
    const parsed = commentBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const comment = await db.candidateComment.create({
      data: { candidateId: candidate.id, authorId: session.user.id, body: parsed.data.body },
      include: { author: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'COMMENT_CREATED',
      resourceType: 'CandidateComment',
      resourceId: comment.id,
      metadata: { candidateId: candidate.id },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates/:id/comments POST]', err);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
