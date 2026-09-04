import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOrgMember, assertOwnership, writeAuditLog, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { commentBodySchema } from '@/lib/validations/pipeline';
import { canModifyDiscussionItem } from '@/lib/discussion-permissions';

interface Params {
  params: { candidateId: string; commentId: string };
}

async function loadScopedComment(orgId: string, candidateId: string, commentId: string) {
  const comment = await db.candidateComment.findUnique({
    where: { id: commentId },
    include: { candidate: true },
  });
  if (!comment || comment.candidateId !== candidateId) return null;
  assertOwnership(comment.candidate.orgId, orgId);
  return comment;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, session, role } = await requireOrgMember('RECRUITER');
    const comment = await loadScopedComment(orgId, params.candidateId, params.commentId);
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

    if (!canModifyDiscussionItem({ authorId: comment.authorId, currentUserId: session.user.id, role })) {
      return NextResponse.json({ error: 'Only the author or an org admin can edit this comment' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = commentBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const updated = await db.candidateComment.update({
      where: { id: comment.id },
      data: { body: parsed.data.body },
      include: { author: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'COMMENT_UPDATED',
      resourceType: 'CandidateComment',
      resourceId: comment.id,
      metadata: { candidateId: params.candidateId },
    });

    return NextResponse.json({ comment: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates/:id/comments/:id PATCH]', err);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { orgId, session, role } = await requireOrgMember('RECRUITER');
    const comment = await loadScopedComment(orgId, params.candidateId, params.commentId);
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

    if (!canModifyDiscussionItem({ authorId: comment.authorId, currentUserId: session.user.id, role })) {
      return NextResponse.json({ error: 'Only the author or an org admin can delete this comment' }, { status: 403 });
    }

    await db.candidateComment.delete({ where: { id: comment.id } });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'COMMENT_DELETED',
      resourceType: 'CandidateComment',
      resourceId: comment.id,
      metadata: { candidateId: params.candidateId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates/:id/comments/:id DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
