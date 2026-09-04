import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireCandidateSessionMock = vi.fn();
const findUniqueMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireCandidateSession: (...args: unknown[]) => requireCandidateSessionMock(...args) };
});

vi.mock('@/lib/db', () => ({
  db: {
    candidateExperience: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
    },
  },
}));

import { PATCH, DELETE } from './route';

const params = { params: { experienceId: 'exp-1' } };

const validBody = { company: 'Acme', title: 'Engineer', startDate: '2022-01-01', isCurrent: true };

function req(body: unknown) {
  return new Request('https://x.test/x', { method: 'PATCH', body: JSON.stringify(body) });
}

beforeEach(() => {
  requireCandidateSessionMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  requireCandidateSessionMock.mockResolvedValue({
    session: { user: { id: 'candidate-a', userType: 'CANDIDATE' } },
    profile: { id: 'profile-a', userId: 'candidate-a' },
  });
});

describe('PATCH /api/candidate/profile/experience/[experienceId]', () => {
  it("updates the row when it belongs to the caller's own profile", async () => {
    findUniqueMock.mockResolvedValue({ id: 'exp-1', candidateProfileId: 'profile-a' });
    updateMock.mockResolvedValue({ id: 'exp-1', ...validBody });

    const res = await PATCH(req(validBody), params);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'exp-1' } }));
  });

  it("returns 404 (not 200/500) for another candidate's experienceId — the IDOR case", async () => {
    // Candidate B's row exists in the DB but belongs to a different profile.
    findUniqueMock.mockResolvedValue({ id: 'exp-1', candidateProfileId: 'profile-B-belongs-to-someone-else' });

    const res = await PATCH(req(validBody), params);

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent experienceId', async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await PATCH(req(validBody), params);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/candidate/profile/experience/[experienceId]', () => {
  it("deletes the row when it belongs to the caller's own profile", async () => {
    findUniqueMock.mockResolvedValue({ id: 'exp-1', candidateProfileId: 'profile-a' });
    deleteMock.mockResolvedValue({ id: 'exp-1' });

    const res = await DELETE(new Request('https://x.test/x', { method: 'DELETE' }), params);
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'exp-1' } });
  });

  it("refuses to delete another candidate's experienceId — the IDOR case", async () => {
    findUniqueMock.mockResolvedValue({ id: 'exp-1', candidateProfileId: 'profile-B-belongs-to-someone-else' });

    const res = await DELETE(new Request('https://x.test/x', { method: 'DELETE' }), params);

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
