import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { parseBooksCsv } from '../../utils/isbnCsv.js';
import * as controller from './controller.js';
import * as repo from './repository.js';
import {
  bookIdParamSchema,
  createBookSchema,
  searchBooksQuerySchema,
  updateBookSchema,
} from './schema.js';

const importCsvBodySchema = z.object({
  csvText: z.string().min(5).max(200_000),
  dryRun: z.boolean().optional().default(false),
});

export function createBooksRouter({ searchLimiter } = {}) {
  const router = Router();
  const publicSearchLimit = searchLimiter ? [searchLimiter] : [];

  router.get(
    '/books',
    ...publicSearchLimit,
    validate({ query: searchBooksQuerySchema }),
    controller.listBooks
  );
  router.get('/books/:id', validate({ params: bookIdParamSchema }), controller.getBook);
  router.post(
    '/books',
    authenticate,
    requireRole('librarian'),
    validate({ body: createBookSchema }),
    controller.createBook
  );
  router.post(
    '/books/import-csv',
    authenticate,
    requireRole('librarian'),
    validate({ body: importCsvBodySchema }),
    (req, res, next) => {
      try {
        const { csvText, dryRun } = req.validated.body;
        const { validRows, rejectedRows } = parseBooksCsv(csvText);
        let imported = 0;
        let skippedDuplicate = 0;
        if (!dryRun && validRows.length > 0) {
          ({ imported, skippedDuplicate } = repo.importValidBooks(validRows, req.user.id));
        }
        res.status(dryRun ? 200 : 201).json({
          data: {
            dryRun,
            validCount: validRows.length,
            rejectedCount: rejectedRows.length,
            imported,
            skippedDuplicate,
            validRows: validRows.slice(0, 50),
            rejectedRows,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );
  router.patch(
    '/books/:id',
    authenticate,
    requireRole('librarian'),
    validate({ params: bookIdParamSchema, body: updateBookSchema }),
    controller.updateBook
  );

  return router;
}
