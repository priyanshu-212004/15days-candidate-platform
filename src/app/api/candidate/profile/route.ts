import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { candidateProfilePatchSchema } from '@/lib/validations/candidate-profile';
import { calculateProfileCompletion } from '@/lib/candidate-profile-completion';

async function serializeProfile(userId: string, profileId: string) {
  const [user, profile, experienceCount, educationCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    db.candidateProfile.findUnique({ where: { id: profileId } }),
    db.candidateExperience.count({ where: { candidateProfileId: profileId } }),
    db.candidateEducation.count({ where: { candidateProfileId: profileId } }),
  ]);
  if (!user || !profile) return null;

  const { resumeParsedText: _omitted, ...profileWithoutParsedText } = profile;
  void _omitted; // intentionally excluded from the response — full parsed resume text is large and not needed for profile display

  return {
    name: user.name,
    email: user.email,
    profile: profileWithoutParsedText,
    profileCompletion: calculateProfileCompletion({
      phone: profile.phone,
      location: profile.location,
      currentTitle: profile.currentTitle,
      totalExperienceYears: profile.totalExperienceYears,
      employmentStatus: profile.employmentStatus,
      preferredJobType: profile.preferredJobType,
      preferredWorkMode: profile.preferredWorkMode,
      skills: profile.skills,
      resumeParseStatus: profile.resumeParseStatus,
      resumeStorageKey: profile.resumeStorageKey,
      experienceCount,
      educationCount,
    }),
  };
}

export async function GET() {
  try {
    const { session, profile } = await requireCandidateSession();
    const data = await serializeProfile(session.user.id, profile.id);
    if (!data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile GET]', err);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { session, profile } = await requireCandidateSession();

    const body = await req.json().catch(() => null);
    // `email` (and `name`, which lives on User) are deliberately not part of
    // this schema at all — see validations/candidate-profile.ts. Even if a
    // client sends { email: '...' } here, it's simply not a field the
    // schema recognizes and Zod drops it; it can never reach `db.update`.
    const parsed = candidateProfilePatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const { phone, location, photoUrl, currentTitle, currentCompany, employmentStatus, ...rest } = parsed.data;

    await db.candidateProfile.update({
      // Ownership is the row requireCandidateSession() already resolved for
      // this session — never an id read from the request.
      where: { id: profile.id },
      data: {
        ...rest,
        phone: phone === '' ? null : phone,
        location: location === '' ? null : location,
        photoUrl: photoUrl === '' ? null : photoUrl,
        currentTitle: currentTitle === '' ? null : currentTitle,
        currentCompany: currentCompany === '' ? null : currentCompany,
        employmentStatus: employmentStatus === '' ? null : employmentStatus,
      },
    });

    const data = await serializeProfile(session.user.id, profile.id);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile PATCH]', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
