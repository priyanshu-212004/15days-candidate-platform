import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

const ROLE_RANK = { VIEWER: 0, RECRUITER: 1, ADMIN: 2, OWNER: 3 } as const;
type Role = keyof typeof ROLE_RANK;

/**
 * Resolves the current session and the caller's membership row for the
 * organization they're acting in. Every mutating route must call this before
 * touching data — we never trust an orgId or resource id supplied by the
 * client without re-checking it against the caller's actual membership.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new UnauthorizedError();
  return session;
}

export async function requireOrgMember(minRole: Role = 'VIEWER') {
  const session = await requireSession();
  if (!session.user.orgId) throw new ForbiddenError('No organization membership');

  const membership = await db.organizationMember.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId: session.user.orgId } },
  });
  if (!membership) throw new ForbiddenError('Not a member of this organization');
  const memberRole = membership.role as Role;
  if (ROLE_RANK[memberRole] < ROLE_RANK[minRole]) {
    throw new ForbiddenError(`Requires ${minRole} role or higher`);
  }

  return { session, orgId: membership.orgId, role: membership.role };
}

/**
 * Candidate counterpart of requireOrgMember() — resolves the session and
 * verifies it belongs to a CANDIDATE account, then loads that account's
 * CandidateProfile. Every candidate route must call this before touching
 * candidate data, exactly as recruiter routes already call requireOrgMember()
 * before touching org data. Reuses the same UnauthorizedError/ForbiddenError
 * classes rather than introducing new ones.
 */
export async function requireCandidateSession() {
  const session = await requireSession();
  if (session.user.userType !== 'CANDIDATE') {
    throw new ForbiddenError('This action requires a candidate account');
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) throw new ForbiddenError('Candidate profile not found');

  return { session, profile };
}

/** Verifies a resource (already fetched with its orgId) belongs to the caller's org. */
export function assertOwnership(resourceOrgId: string, callerOrgId: string) {
  if (resourceOrgId !== callerOrgId) {
    throw new ForbiddenError('Resource does not belong to your organization');
  }
}

export async function writeAuditLog(params: {
  orgId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  await db.auditLog.create({
    data: {
      ...params,
      // Prisma's generated `InputJsonValue` type doesn't structurally match
      // a plain `Record<string, unknown>` (the `unknown` values aren't
      // assignable to Prisma's recursive JSON value union), even though any
      // JSON-serializable object is valid at runtime. This cast is the
      // Prisma-documented way to bridge that gap for JSON columns — it only
      // affects the type checker, not the value being written. `undefined`
      // still passes through untouched, so omitted metadata continues to
      // leave the column unset exactly as before.
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
