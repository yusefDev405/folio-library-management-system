import { z } from 'zod';

export const memberIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listMembersQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  status: z.enum(['active', 'suspended', 'expired']).optional(),
  memberType: z.enum(['student', 'staff', 'external']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const createMemberSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/\d/, 'Password must include a digit'),
  memberNumber: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional().nullable(),
  memberType: z.enum(['student', 'staff', 'external']),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD format'),
});

export const updateMemberSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().max(30).optional().nullable(),
    memberType: z.enum(['student', 'staff', 'external']).optional(),
    status: z.enum(['active', 'suspended', 'expired']).optional(),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD format').optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'At least one field must be provided.');
