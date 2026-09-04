import { describe, it, expect } from 'vitest';
import { signupSchema, loginSchema, resetPasswordSchema } from '@/lib/validations/auth';

describe('signupSchema', () => {
  it('accepts a valid signup payload', () => {
    const result = signupSchema.safeParse({
      name: 'Jordan Reyes',
      email: 'jordan@acme.test',
      password: 'Password1',
      organizationName: 'Acme Technologies',
      acceptedTerms: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a password without an uppercase letter', () => {
    const result = signupSchema.safeParse({
      name: 'Jordan Reyes',
      email: 'jordan@acme.test',
      password: 'password1',
      organizationName: 'Acme Technologies',
      acceptedTerms: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects when terms are not accepted', () => {
    const result = signupSchema.safeParse({
      name: 'Jordan Reyes',
      email: 'jordan@acme.test',
      password: 'Password1',
      organizationName: 'Acme Technologies',
      acceptedTerms: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = signupSchema.safeParse({
      name: 'Jordan Reyes',
      email: 'not-an-email',
      password: 'Password1',
      organizationName: 'Acme Technologies',
      acceptedTerms: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requires a non-empty password', () => {
    const result = loginSchema.safeParse({ email: 'jordan@acme.test', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'Password1',
      confirmPassword: 'Password2',
    });
    expect(result.success).toBe(false);
  });

  it('accepts matching strong passwords', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'Password1',
      confirmPassword: 'Password1',
    });
    expect(result.success).toBe(true);
  });
});
