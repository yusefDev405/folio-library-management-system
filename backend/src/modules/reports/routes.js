import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import * as repo from './repository.js';

export function createReportsRouter() {
  const router = Router();

  router.get('/reports/overdue', authenticate, requireRole('librarian'), (_req, res) => {
    res.json({ data: repo.getOverdueReport() });
  });

  router.get('/reports/popular-books', authenticate, requireRole('librarian'), (_req, res) => {
    res.json({ data: repo.getPopularBooksReport() });
  });

  router.get('/reports/inventory', authenticate, requireRole('librarian'), (_req, res) => {
    res.json({ data: repo.getInventoryReport() });
  });

  router.get('/reports/analytics', authenticate, requireRole('librarian'), (_req, res) => {
    res.json({ data: repo.getAnalyticsDashboard() });
  });

  return router;
}
