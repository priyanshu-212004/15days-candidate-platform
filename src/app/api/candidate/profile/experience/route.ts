import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { candidateExperienceSchema } from '@/lib/validations/candidate-profile';

export async function GET() {
  try {
    const { profile } = await requireCandidateSession();
    const experience = await db.candidateExperience.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    });
    return NextResponse.json({ experience });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/experience GET]', err);
    return NextResponse.json({ error: 'Failed to load experience' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { profile } = await requireCandidateSession();

    const body = await req.json().catch(() => null);
    const parsed = candidateExperienceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const { description, skills, endDate, ...data } = parsed.data;

    const experience = await db.candidateExperience.create({
      data: {
        ...data,
        candidateProfileId: profile.id,
        endDate: data.isCurrent ? null : endDate,
        description: description === '' ? null : description,
        skills: skills ?? [],
      },
    });

    return NextResponse.json({ experience }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/experience POST]', err);
    return NextResponse.json({ error: 'Failed to add experience' }, { status: 500 });
  }
}
