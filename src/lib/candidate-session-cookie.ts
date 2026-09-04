import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

/**
 * The candidate session is identified by the Application row's id, held in
 * an httpOnly cookie scoped per interview token (a candidate could start
 * different interviews in the same browser). The id is a v4 UUID generated
 * server-side by Prisma — the same unguessable-token trust model already
 * used for Interview.publicToken in this codebase — so possession of the
 * cookie is the proof of session ownership. It is never exposed to
 * client-side JS (httpOnly) and never appears in a URL.
 */
function cookieName(token: string): string {
  return `15days_session_${token}`;
}

export function getSessionApplicationId(token: string): string | null {
  return cookies().get(cookieName(token))?.value ?? null;
}

export function setSessionCookie(res: NextResponse, token: string, applicationId: string): void {
  res.cookies.set(cookieName(token), applicationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // Must cover both /interview/[token]/* (pages) and
    // /api/public/interviews/[token]/* (API routes) — those two prefixes
    // share no common path segment other than "/", so root is required for
    // the cookie to actually reach the API routes that need it. The cookie
    // *name* is still unique per interview token, so this doesn't leak a
    // session to unrelated interviews.
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days — long enough to resume, short enough to bound abandoned sessions
  });
}

export function clearSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(cookieName(token), '', { path: '/', maxAge: 0 });
}
