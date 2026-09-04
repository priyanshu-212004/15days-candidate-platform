import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(2, 'Enter your full name').max(120),
  email: z.string().email('Enter a valid work email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
  organizationName: z.string().min(2, 'Enter your company name').max(120),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms to continue' }),
  }),
});
export type SignupInput = z.infer<typeof signupSchema>;

// Phase 3 (candidate platform): deliberately separate from `signupSchema`
// above rather than reusing it with optional fields — candidate signup has
// no organizationName/acceptedTerms and requires confirmPassword, so a
// shared schema would need to make fields conditionally required either
// way. Password rules mirror signupSchema's exactly for consistency.
export const candidateSignupSchema = z
  .object({
    name: z.string().min(2, 'Enter your full name').max(120),
    email: z.string().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type CandidateSignupInput = z.infer<typeof candidateSignupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, 'At least 8 characters').regex(/[A-Z]/).regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
