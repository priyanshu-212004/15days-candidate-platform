import { describe, it, expect } from 'vitest';
import { calculateProfileCompletion } from './candidate-profile-completion';

const empty = {
  phone: null,
  location: null,
  currentTitle: null,
  totalExperienceYears: null,
  employmentStatus: null,
  preferredJobType: null,
  preferredWorkMode: null,
  skills: [],
  resumeParseStatus: null,
  resumeStorageKey: null,
  experienceCount: 0,
  educationCount: 0,
};

describe('calculateProfileCompletion', () => {
  it('returns 0 for a completely empty profile', () => {
    expect(calculateProfileCompletion(empty)).toBe(0);
  });

  it('gives partial credit for a partially filled profile', () => {
    const partial = {
      ...empty,
      phone: '555-0100',
      location: 'Remote',
      skills: ['TypeScript'],
    };
    const score = calculateProfileCompletion(partial);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it('does not count professional info unless all three of its fields are present', () => {
    const almost = { ...empty, currentTitle: 'Engineer', totalExperienceYears: 3 }; // missing employmentStatus
    const complete = { ...almost, employmentStatus: 'Employed' };
    expect(calculateProfileCompletion(complete)).toBeGreaterThan(calculateProfileCompletion(almost));
  });

  it('returns 100 when every section is filled', () => {
    const full = {
      phone: '555-0100',
      location: 'Remote',
      currentTitle: 'Engineer',
      totalExperienceYears: 5,
      employmentStatus: 'Employed',
      preferredJobType: 'FULL_TIME',
      preferredWorkMode: 'REMOTE',
      skills: ['TypeScript', 'React'],
      resumeParseStatus: 'COMPLETED',
      resumeStorageKey: 'candidates/user-1/resume.pdf',
      experienceCount: 2,
      educationCount: 1,
    };
    expect(calculateProfileCompletion(full)).toBe(100);
  });

  it('never exceeds 100 even with data in every field (weights sum to exactly 100 by construction)', () => {
    const full = {
      phone: 'x',
      location: 'x',
      currentTitle: 'x',
      totalExperienceYears: 1,
      employmentStatus: 'x',
      preferredJobType: 'x',
      preferredWorkMode: 'x',
      skills: ['x'],
      resumeParseStatus: 'COMPLETED',
      resumeStorageKey: 'x',
      experienceCount: 5,
      educationCount: 5,
    };
    expect(calculateProfileCompletion(full)).toBeLessThanOrEqual(100);
  });

  it('is deterministic — same input always yields the same output', () => {
    const input = { ...empty, phone: '555-0100' };
    expect(calculateProfileCompletion(input)).toBe(calculateProfileCompletion({ ...input }));
  });
});
