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
    candidateEducation: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
    },
  },
}));

import { PATCH, DELETE } from './route';

const params = { params: { educationId: 'edu-1' } };
const validBody = { degree: 'B.Tech', institution: 'State University' };

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

describe('PATCH /api/candidate/profile/education/[educationId]', () => {
  it("updates the row when it belongs to the caller's own profile", async () => {
    findUniqueMock.mockResolvedValue({ id: 'edu-1', candidateProfileId: 'profile-a' });
    updateMock.mockResolvedValue({ id: 'edu-1', ...validBody });

    const res = await PATCH(req(validBody), params);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'edu-1' } }));
  });

  it("returns 404 for another candidate's educationId — the IDOR case", async () => {
    findUniqueMock.mockResolvedValue({ id: 'edu-1', candidateProfileId: 'profile-B-belongs-to-someone-else' });

    const res = await PATCH(req(validBody), params);

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/candidate/profile/education/[educationId]', () => {
  it("deletes the row when it belongs to the caller's own profile", async () => {
    findUniqueMock.mockResolvedValue({ id: 'edu-1', candidateProfileId: 'profile-a' });
    deleteMock.mockResolvedValue({ id: 'edu-1' });

    const res = await DELETE(new Request('https://x.test/x', { method: 'DELETE' }), params);
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'edu-1' } });
  });

  it("refuses to delete another candidate's educationId — the IDOR case", async () => {
    findUniqueMock.mockResolvedValue({ id: 'edu-1', candidateProfileId: 'profile-B-belongs-to-someone-else' });

    const res = await DELETE(new Request('https://x.test/x', { method: 'DELETE' }), params);

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
