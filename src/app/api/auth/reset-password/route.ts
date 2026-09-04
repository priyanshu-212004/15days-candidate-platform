import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { resetPasswordSchema } from '@/lib/validations/auth';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const limit = await checkRateLimit({
    bucket: 'reset-password',
    identifier: getClientIp(req),
    limit: 10,
    windowSec: 15 * 60,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { token, password } = parsed.data;
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.$transaction([
    db.user.update({ where: { email: record.email }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
