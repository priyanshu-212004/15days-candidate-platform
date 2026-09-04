import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerSessionMock = vi.fn();
const findUniqueMock = vi.fn();
const candidateProfileFindUniqueMock = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/lib/db', () => ({
  db: {
    organizationMember: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
    candidateProfile: {
      findUnique: (...args: unknown[]) => candidateProfileFindUniqueMock(...args),
    },
  },
}));

import {
  requireSession,
  requireOrgMember,
  requireCandidateSession,
  assertOwnership,
  UnauthorizedError,
  ForbiddenError,
} from './authz';

beforeEach(() => {
  getServerSessionMock.mockReset();
  findUniqueMock.mockReset();
  candidateProfileFindUniqueMock.mockReset();
});

describe('requireSession', () => {
  it('throws UnauthorizedError when there is no session', async () => {
    getServerSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow(UnauthorizedError);
  });

  it('returns the session when authenticated', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', orgId: 'org-1' } });
    const session = await requireSession();
    expect(session.user.id).toBe('user-1');
  });
});

describe('requireOrgMember', () => {
  it('throws ForbiddenError when the user has no organization', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', orgId: null } });
    await expect(requireOrgMember('VIEWER')).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when there is no membership row for the org', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', orgId: 'org-1' } });
    findUniqueMock.mockResolvedValue(null);
    await expect(requireOrgMember('VIEWER')).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the member role is below the required role', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', orgId: 'org-1' } });
    findUniqueMock.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', role: 'VIEWER' });
    await expect(requireOrgMember('RECRUITER')).rejects.toThrow(ForbiddenError);
  });

  it('succeeds when the member role meets the required role', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', orgId: 'org-1' } });
    findUniqueMock.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', role: 'ADMIN' });
    const result = await requireOrgMember('RECRUITER');
    expect(result.orgId).toBe('org-1');
    expect(result.role).toBe('ADMIN');
  });
});

describe('requireCandidateSession', () => {
  it('throws UnauthorizedError when there is no session', async () => {
    getServerSessionMock.mockResolvedValue(null);
    await expect(requireCandidateSession()).rejects.toThrow(UnauthorizedError);
  });

  it('throws ForbiddenError for a recruiter account', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', userType: 'RECRUITER' } });
    await expect(requireCandidateSession()).rejects.toThrow(ForbiddenError);
    expect(candidateProfileFindUniqueMock).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when a candidate account has no profile row', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', userType: 'CANDIDATE' } });
    candidateProfileFindUniqueMock.mockResolvedValue(null);
    await expect(requireCandidateSession()).rejects.toThrow(ForbiddenError);
  });

  it('returns the session and profile for a valid candidate account', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1', userType: 'CANDIDATE' } });
    candidateProfileFindUniqueMock.mockResolvedValue({ id: 'profile-1', userId: 'user-1' });

    const result = await requireCandidateSession();

    expect(result.profile.id).toBe('profile-1');
    expect(candidateProfileFindUniqueMock).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});

describe('assertOwnership (organization isolation)', () => {
  it('throws ForbiddenError when a resource belongs to a different org', () => {
    expect(() => assertOwnership('org-other', 'org-mine')).toThrow(ForbiddenError);
  });

  it('does not throw when the resource org matches the caller org', () => {
    expect(() => assertOwnership('org-mine', 'org-mine')).not.toThrow();
  });
});
