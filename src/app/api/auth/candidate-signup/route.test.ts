import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkRateLimitMock = vi.fn();
const userFindUniqueMock = vi.fn();
const transactionMock = vi.fn();
const userCreateMock = vi.fn();
const candidateProfileCreateMock = vi.fn();
const organizationCreateMock = vi.fn();
const organizationMemberCreateMock = vi.fn();
const bcryptHashMock = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: () =>
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

vi.mock('bcryptjs', () => ({
  default: { hash: (...args: unknown[]) => bcryptHashMock(...args) },
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
      create: (...args: unknown[]) => userCreateMock(...args),
    },
    candidateProfile: {
      create: (...args: unknown[]) => candidateProfileCreateMock(...args),
    },
    organization: {
      create: (...args: unknown[]) => organizationCreateMock(...args),
    },
    organizationMember: {
      create: (...args: unknown[]) => organizationMemberCreateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import { POST } from './route';

function req(body: unknown) {
  return new Request('https://x.test/api/auth/candidate-signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'Password1',
  confirmPassword: 'Password1',
};

beforeEach(() => {
  checkRateLimitMock.mockReset();
  userFindUniqueMock.mockReset();
  transactionMock.mockReset();
  userCreateMock.mockReset();
  candidateProfileCreateMock.mockReset();
  organizationCreateMock.mockReset();
  organizationMemberCreateMock.mockReset();
  bcryptHashMock.mockReset();

  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSec: 0, limit: 5 });
  bcryptHashMock.mockResolvedValue('hashed-password');

  // Mimic Prisma's $transaction(fn) signature used by the route.
  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      user: { create: userCreateMock },
      candidateProfile: { create: candidateProfileCreateMock },
    })
  );
});

describe('POST /api/auth/candidate-signup', () => {
  it('returns 429 when rate limited', async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 60, limit: 5 });
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 422 on invalid input', async () => {
    const res = await POST(req({ ...validBody, confirmPassword: 'different' }));
    expect(res.status).toBe(422);
  });

  it('returns 422 when required fields are missing', async () => {
    const res = await POST(req({ email: 'jane@example.com' }));
    expect(res.status).toBe(422);
  });

  it('returns a generic 409 without creating a user when the email already exists', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'existing-user' });
    const res = await POST(req(validBody));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe('Unable to create account with these details');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('creates a CANDIDATE user and a CandidateProfile, and nothing else', async () => {
    userFindUniqueMock.mockResolvedValue(null);
    userCreateMock.mockResolvedValue({ id: 'user-1', email: 'jane@example.com' });
    candidateProfileCreateMock.mockResolvedValue({ id: 'profile-1', userId: 'user-1' });

    const res = await POST(req(validBody));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.userId).toBe('user-1');

    expect(userCreateMock).toHaveBeenCalledWith({
      data: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        passwordHash: 'hashed-password',
        userType: 'CANDIDATE',
      },
    });
    expect(candidateProfileCreateMock).toHaveBeenCalledWith({ data: { userId: 'user-1' } });

    // The whole point of this endpoint: no organization is ever created.
    expect(organizationCreateMock).not.toHaveBeenCalled();
    expect(organizationMemberCreateMock).not.toHaveBeenCalled();
  });

  it('normalizes email to lowercase', async () => {
    userFindUniqueMock.mockResolvedValue(null);
    userCreateMock.mockResolvedValue({ id: 'user-1' });
    candidateProfileCreateMock.mockResolvedValue({ id: 'profile-1' });

    await POST(req({ ...validBody, email: 'Jane@Example.COM' }));

    expect(userFindUniqueMock).toHaveBeenCalledWith({ where: { email: 'jane@example.com' } });
    expect(userCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'jane@example.com' }) })
    );
  });
});
