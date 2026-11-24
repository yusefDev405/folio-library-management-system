import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db.js';
import { spGenerateReminders } from '../../db/procedures.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { AppError, domainError, nowIso } from '../../utils/errors.js';

const notifIdParam = z.object({ id: z.coerce.number().int().positive() });

export function createNotificationsRouter() {
  const router = Router();

  router.get('/me/notifications', authenticate, (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, kind, title, body, read_at AS readAt, created_at AS createdAt
         FROM notifications
         WHERE user_id = ?
         ORDER BY CASE WHEN read_at IS NULL THEN 0 ELSE 1 END, created_at DESC, id DESC
         LIMIT 50`
      )
      .all(req.user.id);

    const unreadCount = db
      .prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(req.user.id).cnt;

    res.json({
      data: rows,
      meta: { unreadCount },
    });
  });

  router.patch(
    '/me/notifications/:id/read',
    authenticate,
    validate({ params: notifIdParam }),
    (req, res, next) => {
      try {
        const db = getDb();
        const row = db
          .prepare('SELECT id, user_id, read_at FROM notifications WHERE id = ?')
          .get(req.validated.params.id);
        if (!row) throw domainError('NOTIFICATION_NOT_FOUND');
        if (row.user_id !== req.user.id) {
          throw new AppError(403, 'FORBIDDEN', 'You can only update your own notifications.');
        }
        const readAt = row.read_at || nowIso();
        db.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(readAt, row.id);
        res.json({
          data: db
            .prepare(
              'SELECT id, kind, title, body, read_at AS readAt, created_at AS createdAt FROM notifications WHERE id = ?'
            )
            .get(row.id),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post('/me/notifications/read-all', authenticate, (req, res) => {
    const info = getDb()
      .prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?')
      .run(nowIso(), req.user.id);
    res.json({ data: { markedCount: info.changes } });
  });

  router.post('/admin/generate-reminders', authenticate, requireRole('admin'), (_req, res) => {
    const result = spGenerateReminders(getDb());
    res.json({ data: result });
  });

  return router;
}
