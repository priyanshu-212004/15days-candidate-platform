import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { candidateExperienceSchema } from '@/lib/validations/candidate-profile';

interface Params {
  params: { experienceId: string };
}

// Loads the row scoped to the caller's own profile — an experienceId that
// exists but belongs to a different candidate resolves to null exactly like
// one that doesn't exist at all, so the 404 response never distinguishes
// "not yours" from "doesn't exist" (no information leak either way).
async function loadOwnExperience(candidateProfileId: string, experienceId: string) {
  const experience = await db.candidateExperience.findUnique({ where: { id: experienceId } });
  if (!experience || experience.candidateProfileId !== candidateProfileId) return null;
  return experience;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { profile } = await requireCandidateSession();
    const existing = await loadOwnExperience(profile.id, params.experienceId);
    if (!existing) return NextResponse.json({ error: 'Experience not found' }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = candidateExperienceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const { description, skills, endDate, ...data } = parsed.data;

    const experience = await db.candidateExperience.update({
      where: { id: existing.id },
      data: {
        ...data,
        endDate: data.isCurrent ? null : endDate,
        description: description === '' ? null : description,
        skills: skills ?? [],
      },
    });

    return NextResponse.json({ experience });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/experience/[id] PATCH]', err);
    return NextResponse.json({ error: 'Failed to update experience' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { profile } = await requireCandidateSession();
    const existing = await loadOwnExperience(profile.id, params.experienceId);
    if (!existing) return NextResponse.json({ error: 'Experience not found' }, { status: 404 });

    await db.candidateExperience.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/experience/[id] DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete experience' }, { status: 500 });
  }
}
