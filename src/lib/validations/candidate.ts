import { z } from 'zod';

export const candidateInfoSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().email('Enter a valid email address').max(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  preferredLanguage: z.string().trim().min(2).max(10).default('en'),
});
export type CandidateInfoInput = z.infer<typeof candidateInfoSchema>;

export const answerTextSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Answer cannot be empty')
    .max(8000, 'Answer is too long'),
});
export type AnswerTextInput = z.infer<typeof answerTextSchema>;

export const uploadUrlRequestSchema = z.object({
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.coerce.number().int().positive().max(500 * 1024 * 1024),
});
export type UploadUrlRequestInput = z.infer<typeof uploadUrlRequestSchema>;

export const recordingCompleteSchema = z.object({
  storageKey: z.string().trim().min(1).max(500),
  durationSec: z.coerce.number().int().min(0).max(3600).optional(),
});
export type RecordingCompleteInput = z.infer<typeof recordingCompleteSchema>;

// Resume upload — loose sanity bounds only. The route enforces the real
// limits (MAX_RESUME_BYTES, isAllowedResumeMimeType/Extension) from
// src/lib/storage.ts, mirroring how uploadUrlRequestSchema above relates to
// MAX_RECORDING_BYTES.
export const resumeUploadUrlRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  sizeBytes: z.coerce.number().int().positive().max(50 * 1024 * 1024),
});
export type ResumeUploadUrlRequestInput = z.infer<typeof resumeUploadUrlRequestSchema>;

export const resumeCompleteSchema = z.object({
  storageKey: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  sizeBytes: z.coerce.number().int().positive().max(50 * 1024 * 1024),
});
export type ResumeCompleteInput = z.infer<typeof resumeCompleteSchema>;
