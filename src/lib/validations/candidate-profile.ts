import { z } from 'zod';

// Personal + professional + preferences + skills/languages/certifications —
// all optional so PATCH /api/candidate/profile can accept a partial update
// (only the fields being edited in whichever section of the UI submitted).
// Deliberately excludes `email`/`name`: email is the User's login identity
// (never editable here — see route.ts) and name lives on User, not
// CandidateProfile, and is out of scope for this endpoint the same way the
// existing recruiter /api/account PATCH is the only place that edits name.
export const candidateProfilePatchSchema = z.object({
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  photoUrl: z.string().trim().url('Enter a valid URL').max(500).optional().or(z.literal('')),

  currentTitle: z.string().trim().max(150).optional().or(z.literal('')),
  currentCompany: z.string().trim().max(150).optional().or(z.literal('')),
  totalExperienceYears: z.coerce.number().min(0).max(60).optional(),
  employmentStatus: z.string().trim().max(60).optional().or(z.literal('')),
  currentCtc: z.coerce.number().min(0).max(100_000_000).optional(),
  expectedCtc: z.coerce.number().min(0).max(100_000_000).optional(),
  ctcCurrency: z.string().trim().min(3).max(3).optional(),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).optional(),

  preferredJobType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'])
    .optional(),
  preferredWorkMode: z.enum(['REMOTE', 'HYBRID', 'ON_SITE']).optional(),
  preferredLocations: z.array(z.string().trim().min(1).max(100)).max(20).optional(),

  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  languages: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  certifications: z.array(z.string().trim().min(1).max(150)).max(30).optional(),
});
export type CandidateProfilePatchInput = z.infer<typeof candidateProfilePatchSchema>;

const currentYear = new Date().getFullYear();

const experienceBase = z.object({
  company: z.string().trim().min(1, 'Company is required').max(150),
  title: z.string().trim().min(1, 'Job title is required').max(150),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().default(false),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
});

export const candidateExperienceSchema = experienceBase.refine(
  (data) => data.isCurrent || !!data.endDate,
  { message: 'End date is required unless this is your current position', path: ['endDate'] }
).refine(
  (data) => !data.endDate || data.endDate >= data.startDate,
  { message: 'End date cannot be before the start date', path: ['endDate'] }
);
export type CandidateExperienceInput = z.infer<typeof experienceBase>;

export const candidateEducationSchema = z.object({
  degree: z.string().trim().min(1, 'Degree is required').max(150),
  institution: z.string().trim().min(1, 'Institution is required').max(200),
  fieldOfStudy: z.string().trim().max(150).optional().or(z.literal('')),
  graduationYear: z.coerce
    .number()
    .int()
    .min(1950, 'Enter a valid year')
    .max(currentYear + 10, 'Enter a valid year')
    .optional(),
});
export type CandidateEducationInput = z.infer<typeof candidateEducationSchema>;
