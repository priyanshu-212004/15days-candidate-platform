import { describe, it, expect } from 'vitest';
import { resolveRoleRedirect } from './route-access';

describe('resolveRoleRedirect', () => {
  it('lets a RECRUITER into /dashboard', () => {
    expect(resolveRoleRedirect('/dashboard/jobs', 'RECRUITER')).toBeNull();
  });

  it('lets a CANDIDATE into /candidate', () => {
    expect(resolveRoleRedirect('/candidate/profile', 'CANDIDATE')).toBeNull();
  });

  it('redirects a CANDIDATE away from /dashboard to /candidate', () => {
    expect(resolveRoleRedirect('/dashboard', 'CANDIDATE')).toBe('/candidate');
  });

  it('redirects a RECRUITER away from /candidate to /dashboard', () => {
    expect(resolveRoleRedirect('/candidate', 'RECRUITER')).toBe('/dashboard');
  });

  it('does not redirect when userType is unknown (defers to the session/auth check)', () => {
    expect(resolveRoleRedirect('/dashboard', undefined)).toBeNull();
    expect(resolveRoleRedirect('/candidate', undefined)).toBeNull();
  });

  it('does not affect unrelated paths', () => {
    expect(resolveRoleRedirect('/interview/abc123', 'CANDIDATE')).toBeNull();
    expect(resolveRoleRedirect('/interview/abc123', 'RECRUITER')).toBeNull();
  });
});
