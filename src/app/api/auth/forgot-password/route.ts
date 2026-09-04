import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';
import { forgotPasswordSchema } from '@/lib/validations/auth';
import { sendEmail } from '@/lib/email';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const ipLimit = await checkRateLimit({
    bucket: 'forgot-password',
    identifier: getClientIp(req),
    limit: 5,
    windowSec: 15 * 60,
  });
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit);

  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 422 });
  }

  const email = parsed.data.email.toLowerCase();

  // Also throttle per-email, independent of IP, so the reset-email flood
  // can't be distributed across many IPs against a single victim address.
  const emailLimit = await checkRateLimit({
    bucket: 'forgot-password-email',
    identifier: email,
    limit: 3,
    windowSec: 15 * 60,
  });
  if (!emailLimit.allowed) return rateLimitResponse(emailLimit);
  const user = await db.user.findUnique({ where: { email } });

  // Always return 200 regardless of whether the user exists, so the endpoint
  // can't be used to enumerate registered accounts.
  if (user) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await db.passwordResetToken.create({
      data: {
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;
    await sendEmail({
      to: email,
      subject: 'Reset your 15days.io password',
      html: `<p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
  }

  return NextResponse.json({ ok: true });
}
