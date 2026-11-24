import { z } from 'zod';

export const checkoutSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  barcode: z.string().trim().min(1).max(32),
});

export const returnSchema = z.object({
  barcode: z.string().trim().min(1).max(32),
});

export const loanIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listLoansQuerySchema = z.object({
  status: z.enum(['active', 'overdue', 'returned']).optional(),
  memberId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const myLoansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
