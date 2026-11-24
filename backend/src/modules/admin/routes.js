import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { paginatedEnvelope } from '../../utils/pagination.js';
import { hashPassword } from '../../utils/password.js';
import * as repo from './repository.js';
import {
  auditLogQuerySchema,
  createUserSchema,
  memberTypeParamSchema,
  updatePolicySchema,
  updateUserSchema,
  userIdParamSchema,
} from './schema.js';

export function createAdminRouter() {
  const router = Router();

  router.get('/users', authenticate, requireRole('admin'), (_req, res) => {
    res.json({ data: repo.listUsers() });
  });

  router.post(
    '/users',
    authenticate,
    requireRole('admin'),
    validate({ body: createUserSchema }),
    async (req, res, next) => {
      try {
        const passwordHash = await hashPassword(req.validated.body.password);
        const user = repo.createUser({
          email: req.validated.body.email,
          passwordHash,
          role: req.validated.body.role,
          actorUserId: req.user.id,
        });
        res.status(201).json({ data: user });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    '/users/:id',
    authenticate,
    requireRole('admin'),
    validate({ params: userIdParamSchema, body: updateUserSchema }),
    (req, res, next) => {
      try {
        const user = repo.updateUser(req.validated.params.id, req.validated.body, req.user.id);
        res.json({ data: user });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/loan-policies', authenticate, requireRole('librarian'), (_req, res) => {
    res.json({ data: repo.listPolicies() });
  });

  router.put(
    '/loan-policies/:memberType',
    authenticate,
    requireRole('admin'),
    validate({ params: memberTypeParamSchema, body: updatePolicySchema }),
    (req, res, next) => {
      try {
        const policy = repo.updatePolicy(
          req.validated.params.memberType,
          req.validated.body,
          req.user.id
        );
        res.json({ data: policy });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/audit-log',
    authenticate,
    requireRole('admin'),
    validate({ query: auditLogQuerySchema }),
    (req, res) => {
      const q = req.validated.query;
      const offset = (q.page - 1) * q.limit;
      const { rows, total } = repo.listAuditLog({
        entity: q.entity,
        from: q.from,
        to: q.to,
        limit: q.limit,
        offset,
      });
      res.json(paginatedEnvelope(rows, { page: q.page, limit: q.limit, total }));
    }
  );

  router.post('/admin/expire-holds', authenticate, requireRole('admin'), (req, res) => {
    const result = repo.runExpireHolds(req.user.id);
    res.json({ data: result });
  });

  router.get('/admin/backups', authenticate, requireRole('admin'), (_req, res) => {
    res.json({ data: repo.listBackups() });
  });

  router.post('/admin/backups', authenticate, requireRole('admin'), (_req, res) => {
    res.status(201).json({ data: repo.createBackupSnapshot() });
  });

  router.post('/admin/backups/verify', authenticate, requireRole('admin'), (req, res, next) => {
    try {
      const result = repo.verifyBackupSnapshot(req.body?.filename || null);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
