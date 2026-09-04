import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireOrgMember, UnauthorizedError, ForbiddenError } from '@/lib/authz';

const updateAccountSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
});

export async function PATCH(req: Request) {
  try {
    const { session } = await requireOrgMember('VIEWER');

    const body = await req.json().catch(() => null);
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const user = await db.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/account PATCH]', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
