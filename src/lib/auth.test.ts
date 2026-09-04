import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkRateLimitMock = vi.fn();
const userFindUniqueMock = vi.fn();
const membershipFindFirstMock = vi.fn();
const bcryptCompareMock = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

vi.mock('bcryptjs', () => ({
  default: { compare: (...args: unknown[]) => bcryptCompareMock(...args) },
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    organizationMember: { findFirst: (...args: unknown[]) => membershipFindFirstMock(...args) },
  },
}));

import type { Session } from 'next-auth';
import { authOptions } from './auth';

// The credentials provider is always registered; Google is only added when
// GOOGLE_CLIENT_ID/SECRET are set (not the case in this test env), so this
// is always the credentials provider regardless of that.
//
// next-auth's CredentialsProvider() factory returns a placeholder
// `authorize: () => null` at the top level — the real function we passed in
// auth.ts only lives at `.options.authorize` until next-auth's own runtime
// init merges `options` back over the provider (which only happens inside
// a real sign-in request, not when a test calls the provider directly).
// So the actual function under test is `.options.authorize`. NextAuth's
// Provider union type doesn't expose this shape, so this cast just narrows
// to what we know is there — mirroring the `as Adapter` cast already used
// in auth.ts for a similar type-mismatch reason.
type CredentialsProviderShape = {
  options: {
    authorize: (
      credentials: Record<'email' | 'password', string>,
      req: unknown
    ) => Promise<{ id: string; userType: 'RECRUITER' | 'CANDIDATE' } | null>;
  };
};
const credentialsProvider = authOptions.providers.find(
  (p) => 'authorize' in p
) as unknown as CredentialsProviderShape;

beforeEach(() => {
  checkRateLimitMock.mockReset();
  userFindUniqueMock.mockReset();
  membershipFindFirstMock.mockReset();
  bcryptCompareMock.mockReset();
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 7, retryAfterSec: 0, limit: 8 });
});

describe('authorize() — userType comes from the database, not the client', () => {
  it('returns userType CANDIDATE for a candidate account', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      name: 'Jane',
      image: null,
      passwordHash: 'hash',
      userType: 'CANDIDATE',
    });
    bcryptCompareMock.mockResolvedValue(true);

    const result = await credentialsProvider.options.authorize(
      { email: 'jane@example.com', password: 'Password1' },
      { headers: {} } as never
    );

    expect(result).toMatchObject({ id: 'user-1', userType: 'CANDIDATE' });
  });

  it('returns userType RECRUITER for a recruiter account, regardless of which login form was used', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'user-2',
      email: 'rec@example.com',
      name: 'Rec',
      image: null,
      passwordHash: 'hash',
      userType: 'RECRUITER',
    });
    bcryptCompareMock.mockResolvedValue(true);

    const result = await credentialsProvider.options.authorize(
      { email: 'rec@example.com', password: 'Password1' },
      { headers: {} } as never
    );

    expect(result).toMatchObject({ id: 'user-2', userType: 'RECRUITER' });
  });

  it('returns null for a wrong password regardless of userType', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user-1', passwordHash: 'hash', userType: 'CANDIDATE' });
    bcryptCompareMock.mockResolvedValue(false);

    const result = await credentialsProvider.options.authorize(
      { email: 'jane@example.com', password: 'wrong' },
      { headers: {} } as never
    );

    expect(result).toBeNull();
  });
});

describe('jwt callback', () => {
  it('attaches orgId/orgRole for a RECRUITER and preserves existing behavior', async () => {
    membershipFindFirstMock.mockResolvedValue({ orgId: 'org-1', role: 'OWNER' });

    const token = await authOptions.callbacks!.jwt!({
      token: {},
      user: { id: 'user-1', userType: 'RECRUITER' } as never,
    } as never);

    expect(token.userId).toBe('user-1');
    expect(token.userType).toBe('RECRUITER');
    expect(token.orgId).toBe('org-1');
    expect(token.orgRole).toBe('OWNER');
    expect(membershipFindFirstMock).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('never queries OrganizationMember for a CANDIDATE and leaves org fields unset', async () => {
    const token = await authOptions.callbacks!.jwt!({
      token: {},
      user: { id: 'user-2', userType: 'CANDIDATE' } as never,
    } as never);

    expect(token.userType).toBe('CANDIDATE');
    expect(token.orgId).toBeUndefined();
    expect(token.orgRole).toBeUndefined();
    expect(membershipFindFirstMock).not.toHaveBeenCalled();
  });

  it('passes an existing token through unchanged on subsequent (non-sign-in) calls', async () => {
    const existing = { userId: 'user-1', userType: 'RECRUITER', orgId: 'org-1', orgRole: 'OWNER' };
    const token = await authOptions.callbacks!.jwt!({ token: { ...existing } } as never);
    expect(token).toEqual(existing);
    expect(membershipFindFirstMock).not.toHaveBeenCalled();
  });
});

describe('session callback', () => {
  it('exposes userType and org fields on the session for a recruiter token', async () => {
    const session = (await authOptions.callbacks!.session!({
      session: { user: {} },
      token: { userId: 'user-1', userType: 'RECRUITER', orgId: 'org-1', orgRole: 'OWNER' },
    } as never)) as Session;

    expect(session.user.userType).toBe('RECRUITER');
    expect(session.user.orgId).toBe('org-1');
    expect(session.user.orgRole).toBe('OWNER');
  });

  it('exposes userType CANDIDATE with undefined org fields', async () => {
    const session = (await authOptions.callbacks!.session!({
      session: { user: {} },
      token: { userId: 'user-2', userType: 'CANDIDATE' },
    } as never)) as Session;

    expect(session.user.userType).toBe('CANDIDATE');
    expect(session.user.orgId).toBeUndefined();
    expect(session.user.orgRole).toBeUndefined();
  });

  it('defaults userType to RECRUITER for a pre-existing token that predates this field', async () => {
    const session = (await authOptions.callbacks!.session!({
      session: { user: {} },
      token: { userId: 'user-1' },
    } as never)) as Session;

    expect(session.user.userType).toBe('RECRUITER');
  });
});
