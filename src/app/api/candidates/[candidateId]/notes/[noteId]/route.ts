import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOrgMember, assertOwnership, writeAuditLog, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { noteBodySchema } from '@/lib/validations/pipeline';
import { canModifyDiscussionItem } from '@/lib/discussion-permissions';

interface Params {
  params: { candidateId: string; noteId: string };
}

async function loadScopedNote(orgId: string, candidateId: string, noteId: string) {
  const note = await db.candidateNote.findUnique({
    where: { id: noteId },
    include: { candidate: true },
  });
  if (!note || note.candidateId !== candidateId) return null;
  assertOwnership(note.candidate.orgId, orgId);
  return note;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, session, role } = await requireOrgMember('RECRUITER');
    const note = await loadScopedNote(orgId, params.candidateId, params.noteId);
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

    // Any org member can read notes; only the author (or an org admin, for
    // moderation) can edit someone else's note — mirrors the pattern used
    // for job/interview mutations, scoped down to the individual author.
    if (!canModifyDiscussionItem({ authorId: note.authorId, currentUserId: session.user.id, role })) {
      return NextResponse.json({ error: 'Only the author or an org admin can edit this note' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = noteBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const updated = await db.candidateNote.update({
      where: { id: note.id },
      data: { body: parsed.data.body },
      include: { author: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'NOTE_UPDATED',
      resourceType: 'CandidateNote',
      resourceId: note.id,
      metadata: { candidateId: params.candidateId },
    });

    return NextResponse.json({ note: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates/:id/notes/:id PATCH]', err);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { orgId, session, role } = await requireOrgMember('RECRUITER');
    const note = await loadScopedNote(orgId, params.candidateId, params.noteId);
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

    if (!canModifyDiscussionItem({ authorId: note.authorId, currentUserId: session.user.id, role })) {
      return NextResponse.json({ error: 'Only the author or an org admin can delete this note' }, { status: 403 });
    }

    await db.candidateNote.delete({ where: { id: note.id } });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'NOTE_DELETED',
      resourceType: 'CandidateNote',
      resourceId: note.id,
      metadata: { candidateId: params.candidateId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates/:id/notes/:id DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
