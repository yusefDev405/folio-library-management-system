import { z } from 'zod';

export const fineIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listFinesQuerySchema = z.object({
  status: z.enum(['unpaid', 'paid', 'waived']).optional(),
  memberId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
