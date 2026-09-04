import { describe, it, expect } from 'vitest';
import { jobCreateSchema, jobUpdateSchema } from './job';

describe('jobCreateSchema', () => {
  const valid = {
    title: 'Senior Backend Engineer',
    description: 'We are looking for an experienced backend engineer to own our platform.',
    requirements: ['5+ years experience'],
    skills: ['Node.js', 'PostgreSQL'],
    experienceLevel: 'Senior',
    location: 'Remote',
    remote: true,
    employmentType: 'FULL_TIME' as const,
    status: 'DRAFT' as const,
  };

  it('accepts a fully valid job payload', () => {
    const result = jobCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects a title that is too short', () => {
    const result = jobCreateSchema.safeParse({ ...valid, title: 'Hi' });
    expect(result.success).toBe(false);
  });

  it('rejects a description that is too short', () => {
    const result = jobCreateSchema.safeParse({ ...valid, description: 'Too short' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid employment type', () => {
    const result = jobCreateSchema.safeParse({ ...valid, employmentType: 'GIG' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid status', () => {
    const result = jobCreateSchema.safeParse({ ...valid, status: 'DELETED' });
    expect(result.success).toBe(false);
  });

  it('defaults requirements and skills to empty arrays when omitted', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { requirements, skills, ...rest } = valid;
    const result = jobCreateSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requirements).toEqual([]);
      expect(result.data.skills).toEqual([]);
    }
  });

  it('defaults remote to false and status to DRAFT when omitted', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { remote, status, ...rest } = valid;
    const result = jobCreateSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remote).toBe(false);
      expect(result.data.status).toBe('DRAFT');
    }
  });
});

describe('jobUpdateSchema', () => {
  it('accepts a partial payload with a single field', () => {
    const result = jobUpdateSchema.safeParse({ title: 'Updated Title Here' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty payload', () => {
    const result = jobUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('still validates provided fields against the same rules', () => {
    const result = jobUpdateSchema.safeParse({ title: 'X' });
    expect(result.success).toBe(false);
  });
});
