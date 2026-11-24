import { z } from 'zod';

export const createReservationSchema = z.object({
  bookId: z.coerce.number().int().positive(),
});

export const reservationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
