import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { resolveRoleRedirect } from '@/lib/route-access';

// Phase 3: now also covers /candidate/:path*, role-aware. The `authorized`
// callback below still runs first and unconditionally requires a session
// for anything matched (unchanged behavior for /dashboard); the
// `middleware` function only runs once that's true, and additionally
// bounces a signed-in user away from the *other* role's route tree. This is
// UX-level routing, not the authorization boundary — every candidate/
// recruiter server layout and API route re-verifies userType independently
// (see requireCandidateSession()/requireOrgMember()), so this redirect is
// never the only thing standing between a role and the wrong data.
export default withAuth(
  function middleware(req) {
    const redirectTo = resolveRoleRedirect(req.nextUrl.pathname, req.nextauth.token?.userType);
    if (redirectTo) {
      return NextResponse.redirect(new URL(redirectTo, req.url));
    }
    return NextResponse.next();
  },
  {
    pages: { signIn: '/login' },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

// Candidate interview routes (/interview/[token]) are intentionally public —
// candidates taking an interview never authenticate through this system.
// Only the two authenticated portals require a session.
export const config = {
  matcher: ['/dashboard/:path*', '/candidate/:path*'],
};
