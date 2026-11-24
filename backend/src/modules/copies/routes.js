import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import * as repo from './repository.js';
import {
  bookCopyParamSchema,
  copyIdParamSchema,
  createCopySchema,
  updateCopySchema,
} from './schema.js';

const reportIssueSchema = z.object({
  status: z.enum(['lost', 'damaged']),
  fineAmount: z.coerce.number().min(0).max(1000).optional().default(0),
});

export function createCopiesRouter() {
  const router = Router();

  router.post(
    '/books/:id/copies',
    authenticate,
    requireRole('librarian'),
    validate({ params: bookCopyParamSchema, body: createCopySchema }),
    controller.addCopy
  );

  router.patch(
    '/copies/:id',
    authenticate,
    requireRole('librarian'),
    validate({ params: copyIdParamSchema, body: updateCopySchema }),
    controller.updateCopy
  );

  router.get(
    '/copies/:id/history',
    authenticate,
    requireRole('librarian'),
    validate({ params: copyIdParamSchema }),
    (req, res, next) => {
      try {
        res.json({ data: repo.getCopyHistory(req.validated.params.id) });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/copies/:id/report-issue',
    authenticate,
    requireRole('librarian'),
    validate({ params: copyIdParamSchema, body: reportIssueSchema }),
    (req, res, next) => {
      try {
        const result = repo.reportCopyIssue(
          req.validated.params.id,
          req.validated.body,
          req.user.id
        );
        res.json({ data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
