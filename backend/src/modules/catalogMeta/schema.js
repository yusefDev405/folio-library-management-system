import { z } from 'zod';

export const createAuthorSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.coerce.number().int().positive().optional().nullable(),
});
