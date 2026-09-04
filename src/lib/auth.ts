import type { AuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authOptions: AuthOptions = {
  // @auth/prisma-adapter targets @auth/core's Adapter type, which differs
  // slightly from next-auth v4's own Adapter type (a known version-mismatch
  // quirk between the two packages, pre-dating Phase 2). The shapes are
  // compatible at runtime; this cast just reconciles the two type
  // definitions without changing any adapter behavior.
  adapter: PrismaAdapter(db) as Adapter,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    // OAuth-ready: only registered when credentials are configured, so the app
    // still boots cleanly with just email/password until Google OAuth is set up.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw, req) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Rate limit by IP+email combined so a single IP can't brute-force one
        // account, and a botnet can't spread a single account's guesses
        // across many IPs without also being throttled per-IP.
        const forwardedFor = (req?.headers as Record<string, string> | undefined)?.['x-forwarded-for'];
        const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
        const limit = await checkRateLimit({
          bucket: 'login',
          identifier: `${ip}:${email.toLowerCase()}`,
          limit: 8,
          windowSec: 5 * 60,
        });
        if (!limit.allowed) {
          throw new Error('Too many login attempts. Please try again in a few minutes.');
        }

        const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // userType comes straight from the database row — never from
        // anything the client sent (there is no "role" field in the
        // credentials payload at all). This is the single source of truth
        // that the jwt/session callbacks below propagate; whichever login
        // form the person used to get here has no bearing on it.
        return { id: user.id, email: user.email, name: user.name, image: user.image, userType: user.userType };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.userType = user.userType;

        // Recruiter authentication is unchanged: still loads the caller's
        // organization membership onto the token. Candidate accounts are
        // org-independent by design (Phase 2/3) — never touch
        // OrganizationMember for them, and explicitly clear any stale
        // org fields rather than leaving them unset.
        if (user.userType === 'RECRUITER') {
          const membership = await db.organizationMember.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' },
          });
          if (membership) {
            token.orgId = membership.orgId;
            token.orgRole = membership.role;
          }
        } else {
          token.orgId = undefined;
          token.orgRole = undefined;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        // Tokens issued before this field existed won't carry a userType
        // claim until the person signs in again; defaulting to RECRUITER
        // here matches User.userType's own database default, so an
        // existing recruiter session behaves exactly as it did before.
        session.user.userType = token.userType ?? 'RECRUITER';
        session.user.orgId = token.orgId;
        session.user.orgRole = token.orgRole;
      }
      return session;
    },
  },
};
