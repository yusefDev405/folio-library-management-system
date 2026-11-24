import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { fineIdParamSchema, listFinesQuerySchema } from './schema.js';

export function createFinesRouter() {
  const router = Router();

  router.get('/me/fines', authenticate, requireRole('member'), controller.listMyFines);

  router.get(
    '/fines',
    authenticate,
    requireRole('librarian'),
    validate({ query: listFinesQuerySchema }),
    controller.listFines
  );

  router.post(
    '/fines/:id/pay',
    authenticate,
    requireRole('librarian'),
    validate({ params: fineIdParamSchema }),
    controller.payFine
  );

  router.post(
    '/fines/:id/waive',
    authenticate,
    requireRole('admin'),
    validate({ params: fineIdParamSchema }),
    controller.waiveFine
  );

  return router;
}
