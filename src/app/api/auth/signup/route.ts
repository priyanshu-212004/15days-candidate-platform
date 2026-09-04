import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { signupSchema } from '@/lib/validations/auth';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function POST(req: Request) {
  const limit = await checkRateLimit({
    bucket: 'signup',
    identifier: getClientIp(req),
    limit: 5,
    windowSec: 60 * 60,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { name, email, password, organizationName } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    // Deliberately generic message — do not reveal whether the email exists.
    return NextResponse.json({ error: 'Unable to create account with these details' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let slugBase = slugify(organizationName) || 'org';
  let slug = slugBase;
  let suffix = 1;
  while (await db.organization.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${slugBase}-${suffix}`;
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const user = await tx.user.create({
      data: { name, email: normalizedEmail, passwordHash },
    });

    const org = await tx.organization.create({
      data: { name: organizationName, slug },
    });

    await tx.organizationMember.create({
      data: { userId: user.id, orgId: org.id, role: 'OWNER' },
    });

    await tx.pipelineStage.createMany({
      data: [
        { orgId: org.id, name: 'Applied', order: 0, isDefault: true },
        { orgId: org.id, name: 'Screening', order: 1, isDefault: true },
        { orgId: org.id, name: 'Interview', order: 2, isDefault: true },
        { orgId: org.id, name: 'Shortlisted', order: 3, isDefault: true },
        { orgId: org.id, name: 'Offer', order: 4, isDefault: true },
        { orgId: org.id, name: 'Hired', order: 5, isDefault: true },
        { orgId: org.id, name: 'Rejected', order: 6, isDefault: true },
      ],
    });

    await tx.auditLog.create({
      data: {
        orgId: org.id,
        userId: user.id,
        action: 'ORG_CREATED',
        resourceType: 'Organization',
        resourceId: org.id,
      },
    });

    return { user, org };
  });

  return NextResponse.json(
    { userId: result.user.id, orgSlug: result.org.slug },
    { status: 201 }
  );
}
