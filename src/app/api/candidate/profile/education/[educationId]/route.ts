import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { candidateEducationSchema } from '@/lib/validations/candidate-profile';

interface Params {
  params: { educationId: string };
}

async function loadOwnEducation(candidateProfileId: string, educationId: string) {
  const education = await db.candidateEducation.findUnique({ where: { id: educationId } });
  if (!education || education.candidateProfileId !== candidateProfileId) return null;
  return education;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { profile } = await requireCandidateSession();
    const existing = await loadOwnEducation(profile.id, params.educationId);
    if (!existing) return NextResponse.json({ error: 'Education not found' }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = candidateEducationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const { fieldOfStudy, ...data } = parsed.data;

    const education = await db.candidateEducation.update({
      where: { id: existing.id },
      data: { ...data, fieldOfStudy: fieldOfStudy === '' ? null : fieldOfStudy },
    });

    return NextResponse.json({ education });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/education/[id] PATCH]', err);
    return NextResponse.json({ error: 'Failed to update education' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { profile } = await requireCandidateSession();
    const existing = await loadOwnEducation(profile.id, params.educationId);
    if (!existing) return NextResponse.json({ error: 'Education not found' }, { status: 404 });

    await db.candidateEducation.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/education/[id] DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete education' }, { status: 500 });
  }
}
