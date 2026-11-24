import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import * as repo from './repository.js';
import { createAuthorSchema, createCategorySchema } from './schema.js';

export function createCatalogMetaRouter() {
  const router = Router();

  router.get('/authors', (_req, res) => {
    res.json({ data: repo.listAuthors() });
  });

  router.post(
    '/authors',
    authenticate,
    requireRole('librarian'),
    validate({ body: createAuthorSchema }),
    (req, res) => {
      const author = repo.createAuthor(req.validated.body.name);
      res.status(201).json({ data: author });
    }
  );

  router.get('/categories', (_req, res) => {
    res.json({ data: repo.listCategories() });
  });

  router.post(
    '/categories',
    authenticate,
    requireRole('librarian'),
    validate({ body: createCategorySchema }),
    (req, res, next) => {
      try {
        const category = repo.createCategory(req.validated.body);
        res.status(201).json({ data: category });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
