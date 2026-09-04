import { z } from 'zod';

export const jobStatusEnum = z.enum(['DRAFT', 'OPEN', 'PAUSED', 'ARCHIVED']);
export const employmentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);

const listField = z
  .array(z.string().trim().min(1))
  .max(40)
  .default([]);

export const jobCreateSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
  description: z.string().trim().min(20, 'Add a bit more detail to the description').max(8000),
  requirements: listField,
  skills: listField,
  experienceLevel: z.string().trim().max(80).optional().or(z.literal('')),
  location: z.string().trim().max(160).optional().or(z.literal('')),
  remote: z.boolean().default(false),
  employmentType: employmentTypeEnum.default('FULL_TIME'),
  status: jobStatusEnum.default('DRAFT'),
});
export type JobCreateInput = z.infer<typeof jobCreateSchema>;

export const jobUpdateSchema = jobCreateSchema.partial();
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;

export const jobListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: jobStatusEnum.optional(),
});
