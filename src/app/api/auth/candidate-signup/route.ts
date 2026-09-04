import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { candidateSignupSchema } from '@/lib/validations/auth';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

// Candidate counterpart of src/app/api/auth/signup/route.ts. Deliberately a
// separate endpoint rather than a branch inside the existing one — the two
// create structurally different things (no Organization/OrganizationMember/
// PipelineStage here at all) and keeping them separate means this route can
// never accidentally affect the existing recruiter signup path.
export async function POST(req: Request) {
  const limit = await checkRateLimit({
    bucket: 'candidate-signup',
    identifier: getClientIp(req),
    limit: 5,
    windowSec: 60 * 60,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await req.json().catch(() => null);
  const parsed = candidateSignupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    // Same deliberately generic message as the recruiter signup route —
    // does not reveal whether the email exists, and does not reveal
    // whether an existing account is a recruiter or a candidate account.
    return NextResponse.json({ error: 'Unable to create account with these details' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Single transaction so we never end up with a User row and no
  // CandidateProfile if the second insert fails.
  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const user = await tx.user.create({
      data: { name, email: normalizedEmail, passwordHash, userType: 'CANDIDATE' },
    });

    // Minimal profile — just enough to exist and be found by
    // requireCandidateSession(). Every professional field is left for the
    // candidate to fill in later from their profile page (a later phase).
    const profile = await tx.candidateProfile.create({
      data: { userId: user.id },
    });

    return { user, profile };
  });

  return NextResponse.json({ userId: result.user.id }, { status: 201 });
}
