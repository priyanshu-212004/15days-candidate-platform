import { z } from 'zod';

export const marketplaceJobFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  workMode: z.enum(['REMOTE', 'ON_SITE']).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});
export type MarketplaceJobFiltersInput = z.infer<typeof marketplaceJobFiltersSchema>;
