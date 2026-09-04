/**
 * Email provider abstraction.
 *
 * No transactional email provider is configured yet. Set EMAIL_PROVIDER and
 * the matching credentials in .env (see .env.example) to enable real sending —
 * e.g. EMAIL_PROVIDER=resend + RESEND_API_KEY. Until then, sends are logged
 * server-side so password-reset/invite flows remain testable end to end.
 */

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ delivered: boolean }> {
  const provider = process.env.EMAIL_PROVIDER;

  if (!provider) {
    console.warn(
      `[email] EMAIL_PROVIDER not configured — logging instead of sending.\n` +
        `  to: ${input.to}\n  subject: ${input.subject}`
    );
    return { delivered: false };
  }

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'noreply@15days.io',
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!res.ok) throw new Error(`Resend API error: ${res.status}`);
    return { delivered: true };
  }

  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}
