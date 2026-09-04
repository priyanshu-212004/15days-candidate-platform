import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSessionApplicationIdMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('@/lib/candidate-session-cookie', () => ({
  getSessionApplicationId: (...args: unknown[]) => getSessionApplicationIdMock(...args),
}));

vi.mock('@/lib/db', () => ({
  db: { application: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

import { resolveCandidateSession } from './candidate-session';

beforeEach(() => {
  getSessionApplicationIdMock.mockReset();
  findUniqueMock.mockReset();
});

describe('resolveCandidateSession', () => {
  it('returns null when there is no session cookie', async () => {
    getSessionApplicationIdMock.mockReturnValue(null);
    const result = await resolveCandidateSession('token-a');
    expect(result).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('returns null when the cookie references an application that no longer exists', async () => {
    getSessionApplicationIdMock.mockReturnValue('app-1');
    findUniqueMock.mockResolvedValue(null);
    const result = await resolveCandidateSession('token-a');
    expect(result).toBeNull();
  });

  it('rejects a session whose application belongs to a different interview token (cross-interview IDOR)', async () => {
    getSessionApplicationIdMock.mockReturnValue('app-1');
    findUniqueMock.mockResolvedValue({
      id: 'app-1',
      interview: { id: 'interview-1', orgId: 'org-1', publicToken: 'token-b', status: 'ACTIVE', expiresAt: null },
      candidate: { id: 'cand-1', name: 'Amara Chen', email: 'amara@example.com' },
    });
    // The cookie under the "15days_session_token-a" name pointed at app-1,
    // but app-1's interview.publicToken is actually "token-b" — this can
    // only happen via tampering, and must never resolve.
    const result = await resolveCandidateSession('token-a');
    expect(result).toBeNull();
  });

  it('resolves a valid session whose application matches the requested interview token', async () => {
    getSessionApplicationIdMock.mockReturnValue('app-1');
    findUniqueMock.mockResolvedValue({
      id: 'app-1',
      interview: { id: 'interview-1', orgId: 'org-1', publicToken: 'token-a', status: 'ACTIVE', expiresAt: null },
      candidate: { id: 'cand-1', name: 'Amara Chen', email: 'amara@example.com' },
    });
    const result = await resolveCandidateSession('token-a');
    expect(result?.id).toBe('app-1');
  });
});
