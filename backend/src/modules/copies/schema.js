import { z } from 'zod';

export const bookCopyParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const copyIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createCopySchema = z.object({
  barcode: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'Barcode must be alphanumeric with optional hyphens/underscores.'),
  shelfLocation: z.string().trim().min(1).max(64),
});

export const updateCopySchema = z
  .object({
    shelfLocation: z.string().trim().min(1).max(64).optional(),
    status: z.enum(['available', 'lost', 'damaged']).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'At least one field must be provided.');
