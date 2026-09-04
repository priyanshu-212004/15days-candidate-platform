import { describe, it, expect } from 'vitest';
import { resolveCandidateLinkAction } from './candidate-application';

describe('resolveCandidateLinkAction', () => {
  it('Case A: already linked to this user — REUSE', () => {
    const result = resolveCandidateLinkAction({ id: 'cand-1', userId: 'user-1' }, 'user-1');
    expect(result).toEqual({ kind: 'REUSE', candidateId: 'cand-1' });
  });

  it('Case B: exists, unlinked — LINK', () => {
    const result = resolveCandidateLinkAction({ id: 'cand-1', userId: null }, 'user-1');
    expect(result).toEqual({ kind: 'LINK', candidateId: 'cand-1' });
  });

  it('Case C: exists, linked to a different user — CONFLICT, never overwritten', () => {
    const result = resolveCandidateLinkAction({ id: 'cand-1', userId: 'someone-else' }, 'user-1');
    expect(result).toEqual({ kind: 'CONFLICT' });
  });

  it('Case D: no existing row — CREATE', () => {
    const result = resolveCandidateLinkAction(null, 'user-1');
    expect(result).toEqual({ kind: 'CREATE' });
  });
});
