import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import * as repo from './repository.js';
import { createReservationSchema, reservationIdParamSchema } from './schema.js';

const listReservationsQuery = z.object({
  status: z.enum(['waiting', 'ready', 'fulfilled', 'cancelled', 'expired']).optional(),
});

export function createReservationsRouter() {
  const router = Router();

  router.get(
    '/reservations',
    authenticate,
    requireRole('librarian'),
    validate({ query: listReservationsQuery }),
    (req, res) => {
      res.json({ data: repo.listAllReservations(req.validated.query) });
    }
  );

  router.post(
    '/reservations',
    authenticate,
    requireRole('member'),
    validate({ body: createReservationSchema }),
    controller.createReservation
  );

  router.get(
    '/me/reservations',
    authenticate,
    requireRole('member'),
    controller.listMyReservations
  );

  router.delete(
    '/reservations/:id',
    authenticate,
    requireRole('member', 'librarian'),
    validate({ params: reservationIdParamSchema }),
    controller.cancelReservation
  );

  return router;
}
