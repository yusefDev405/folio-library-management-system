import { z } from 'zod';

const isbnRegex = /^(?:\d{9}[\dX]|\d{13})$/;

export const bookIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const searchBooksQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  category: z.coerce.number().int().positive().optional(),
  author: z.coerce.number().int().positive().optional(),
  available: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['title', 'published_year', 'available_copies']).optional().default('title'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const createBookSchema = z.object({
  isbn: z
    .string()
    .trim()
    .transform((s) => s.replace(/[-\s]/g, '').toUpperCase())
    .refine((s) => isbnRegex.test(s), 'ISBN must be 10 or 13 characters (digits, optional trailing X for ISBN-10).'),
  title: z.string().trim().min(1).max(255),
  publisher: z.string().trim().max(160).optional().nullable(),
  publishedYear: z.coerce.number().int().min(1400).max(2100).optional().nullable(),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().trim().max(2000).optional().default(''),
  authorIds: z.array(z.coerce.number().int().positive()).min(1).max(10),
});

export const updateBookSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    publisher: z.string().trim().max(160).optional().nullable(),
    publishedYear: z.coerce.number().int().min(1400).max(2100).optional().nullable(),
    categoryId: z.coerce.number().int().positive().optional().nullable(),
    description: z.string().trim().max(2000).optional(),
    authorIds: z.array(z.coerce.number().int().positive()).min(1).max(10).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'At least one field must be provided.');
