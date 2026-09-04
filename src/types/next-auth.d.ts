import type { DefaultSession, DefaultUser } from 'next-auth';

// Phase 3 (candidate platform): a User is either a RECRUITER (existing,
// org-scoped via OrganizationMember) or a CANDIDATE (new, org-independent
// via CandidateProfile). Kept as a plain string union here rather than
// importing the Prisma `UserType` enum, matching how `orgRole` below is
// already typed as `string` instead of the Prisma `OrgRole` enum.
type AppUserType = 'RECRUITER' | 'CANDIDATE';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      userType: AppUserType;
      orgId?: string;
      orgRole?: string;
    } & DefaultSession['user'];
  }

  // Returned by `authorize()` in the credentials provider and passed into
  // the `jwt` callback's `user` argument on initial sign-in.
  interface User extends DefaultUser {
    userType: AppUserType;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    userType?: AppUserType;
    orgId?: string;
    orgRole?: string;
  }
}
