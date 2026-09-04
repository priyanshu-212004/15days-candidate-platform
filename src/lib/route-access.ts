export type AppUserType = 'RECRUITER' | 'CANDIDATE' | undefined;

/**
 * Given the current pathname and the signed-in user's type, returns the path
 * to redirect to, or null if the request should proceed as-is. Used by
 * middleware.ts (and could be reused by a server layout) to keep recruiters
 * and candidates out of each other's route tree.
 *
 * This is UX-level routing, not the authorization boundary — every
 * candidate/recruiter server layout and API route independently re-verifies
 * userType (requireCandidateSession()/requireOrgMember()), so a caller
 * skipping this function is inconvenient, not insecure.
 */
export function resolveRoleRedirect(pathname: string, userType: AppUserType): string | null {
  if (pathname.startsWith('/dashboard') && userType === 'CANDIDATE') {
    return '/candidate';
  }
  if (pathname.startsWith('/candidate') && userType === 'RECRUITER') {
    return '/dashboard';
  }
  return null;
}
