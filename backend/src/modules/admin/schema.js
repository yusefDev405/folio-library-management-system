import { z } from 'zod';

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/\d/, 'Password must include a digit'),
  role: z.enum(['member', 'librarian', 'admin']),
});

export const updateUserSchema = z
  .object({
    role: z.enum(['member', 'librarian', 'admin']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'At least one field must be provided.');

export const memberTypeParamSchema = z.object({
  memberType: z.enum(['student', 'staff', 'external']),
});

export const updatePolicySchema = z.object({
  maxLoans: z.coerce.number().int().min(0).max(100),
  loanDays: z.coerce.number().int().min(1).max(365),
  maxRenewals: z.coerce.number().int().min(0).max(20),
  dailyFine: z.coerce.number().min(0).max(100),
  maxUnpaidFines: z.coerce.number().min(0).max(1000),
  holdDays: z.coerce.number().int().min(1).max(30).optional(),
});

export const auditLogQuerySchema = z.object({
  entity: z.string().trim().max(40).optional(),
  from: z.string().trim().max(32).optional(),
  to: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
