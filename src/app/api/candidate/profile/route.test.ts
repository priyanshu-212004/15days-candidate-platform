import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const userFindUniqueMock = vi.fn();
const candidateProfileFindUniqueMock = vi.fn();
const candidateProfileUpdateMock = vi.fn();
const experienceCountMock = vi.fn();
const educationCountMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    candidateProfile: {
      findUnique: (...args: unknown[]) => candidateProfileFindUniqueMock(...args),
      update: (...args: unknown[]) => candidateProfileUpdateMock(...args),
    },
    candidateExperience: { count: (...args: unknown[]) => experienceCountMock(...args) },
    candidateEducation: { count: (...args: unknown[]) => educationCountMock(...args) },
  },
}));

import { GET, PATCH } from './route';
import { UnauthorizedError, ForbiddenError } from '@/lib/authz';

const baseProfile = {
  id: 'profile-1',
  userId: 'user-1',
  phone: '555-0100',
  location: 'Remote',
  photoUrl: null,
  currentTitle: 'Engineer',
  currentCompany: 'Acme',
  totalExperienceYears: 3,
  employmentStatus: 'Employed',
  currentCtc: 100000,
  expectedCtc: 120000,
  ctcCurrency: 'USD',
  noticePeriodDays: 30,
  preferredJobType: 'FULL_TIME',
  preferredWorkMode: 'REMOTE',
  preferredLocations: [],
  skills: ['TypeScript'],
  languages: [],
  certifications: [],
  resumeStorageKey: null,
  resumeFileName: null,
  resumeMimeType: null,
  resumeSizeBytes: null,
  resumeParsedText: 'a very long parsed resume body that should not appear in the response',
  resumeParseStatus: 'PENDING',
  resumeParseError: null,
};

function patchReq(body: unknown) {
  return new Request('https://x.test/api/candidate/profile', { method: 'PATCH', body: JSON.stringify(body) });
}

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  userFindUniqueMock.mockReset();
  candidateProfileFindUniqueMock.mockReset();
  candidateProfileUpdateMock.mockReset();
  experienceCountMock.mockReset();
  educationCountMock.mockReset();

  requireCandidateSessionMock.mockResolvedValue({
    session: { user: { id: 'user-1', userType: 'CANDIDATE' } },
    profile: { id: 'profile-1', userId: 'user-1' },
  });
  userFindUniqueMock.mockResolvedValue({ name: 'Jane Doe', email: 'jane@example.com' });
  candidateProfileFindUniqueMock.mockResolvedValue(baseProfile);
  experienceCountMock.mockResolvedValue(1);
  educationCountMock.mockResolvedValue(1);
});

describe('GET /api/candidate/profile', () => {
  it('returns the profile for the authenticated candidate, without raw parsed resume text', async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.email).toBe('jane@example.com');
    expect(data.profile.currentTitle).toBe('Engineer');
    expect(data.profile.resumeParsedText).toBeUndefined();
    expect(typeof data.profileCompletion).toBe('number');
  });

  it('returns 401 when there is no session', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for a recruiter account', async () => {
    requireCandidateSessionMock.mockRejectedValue(new ForbiddenError('This action requires a candidate account'));
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/candidate/profile', () => {
  it('updates fields scoped to the session-resolved profile id, never a client-supplied id', async () => {
    candidateProfileUpdateMock.mockResolvedValue({ ...baseProfile, currentTitle: 'Staff Engineer' });

    const res = await PATCH(patchReq({ currentTitle: 'Staff Engineer', candidateId: 'someone-elses-profile' }));
    expect(res.status).toBe(200);

    expect(candidateProfileUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'profile-1' } })
    );
  });

  it('ignores an attempt to change email through this endpoint — it never reaches the update call', async () => {
    candidateProfileUpdateMock.mockResolvedValue(baseProfile);

    await PATCH(patchReq({ phone: '555-0199', email: 'attacker@evil.test' }));

    const updateArgs = candidateProfileUpdateMock.mock.calls[0]?.[0];
    expect(JSON.stringify(updateArgs)).not.toContain('attacker@evil.test');
    expect(userFindUniqueMock).toHaveBeenCalled(); // only ever read, never updates User.email
  });

  it('rejects invalid input with 422', async () => {
    const res = await PATCH(patchReq({ totalExperienceYears: -5 }));
    expect(res.status).toBe(422);
    expect(candidateProfileUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireCandidateSessionMock.mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(patchReq({ phone: '555-0100' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a recruiter account', async () => {
    requireCandidateSessionMock.mockRejectedValue(new ForbiddenError('This action requires a candidate account'));
    const res = await PATCH(patchReq({ phone: '555-0100' }));
    expect(res.status).toBe(403);
  });
});
