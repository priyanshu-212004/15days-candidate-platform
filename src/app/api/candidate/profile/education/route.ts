import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { candidateEducationSchema } from '@/lib/validations/candidate-profile';

export async function GET() {
  try {
    const { profile } = await requireCandidateSession();
    const education = await db.candidateEducation.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ graduationYear: 'desc' }],
    });
    return NextResponse.json({ education });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/education GET]', err);
    return NextResponse.json({ error: 'Failed to load education' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { profile } = await requireCandidateSession();

    const body = await req.json().catch(() => null);
    const parsed = candidateEducationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const { fieldOfStudy, ...data } = parsed.data;

    const education = await db.candidateEducation.create({
      data: { ...data, candidateProfileId: profile.id, fieldOfStudy: fieldOfStudy === '' ? null : fieldOfStudy },
    });

    return NextResponse.json({ education }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/education POST]', err);
    return NextResponse.json({ error: 'Failed to add education' }, { status: 500 });
  }
}
