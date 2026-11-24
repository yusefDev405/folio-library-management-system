import { Router } from 'express';
import { z } from 'zod';
import { getDb, withTransaction } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { AppError, domainError, nowIso } from '../../utils/errors.js';

const bookIdParam = z.object({ id: z.coerce.number().int().positive() });
const readingBookParam = z.object({ bookId: z.coerce.number().int().positive() });
const reviewIdParam = z.object({ id: z.coerce.number().int().positive() });

const upsertReadingSchema = z.object({
  bookId: z.coerce.number().int().positive(),
  shelf: z.enum(['want_to_read', 'reading', 'finished']).default('want_to_read'),
  notes: z.string().trim().max(1000).optional().default(''),
});

const patchReadingSchema = z.object({
  shelf: z.enum(['want_to_read', 'reading', 'finished']).optional(),
  notes: z.string().trim().max(1000).optional(),
}).refine((o) => Object.keys(o).length > 0, 'Provide shelf or notes.');

const upsertReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(''),
});

export function createEngagementRouter() {
  const router = Router();

  // --- Member Reading List ---
  router.get('/me/reading-list', authenticate, requireRole('member'), (req, res) => {
    if (!req.user.memberId) return res.json({ data: [] });
    const rows = getDb()
      .prepare(
        `SELECT rl.id, rl.book_id AS bookId, rl.shelf, rl.notes, rl.created_at AS createdAt, rl.updated_at AS updatedAt,
                b.title, b.isbn, b.published_year AS publishedYear,
                COALESCE(c.name, 'General') AS categoryName,
                v.available_copies AS availableCopies, v.total_copies AS totalCopies
         FROM reading_list rl
         JOIN books b ON b.id = rl.book_id
         JOIN v_book_availability v ON v.book_id = b.id
         LEFT JOIN categories c ON c.id = b.category_id
         WHERE rl.member_id = ?
         ORDER BY rl.updated_at DESC, rl.id DESC`
      )
      .all(req.user.memberId);
    res.json({ data: rows });
  });

  router.post(
    '/me/reading-list',
    authenticate,
    requireRole('member'),
    validate({ body: upsertReadingSchema }),
    (req, res, next) => {
      try {
        if (!req.user.memberId) {
          throw new AppError(403, 'MEMBER_PROFILE_REQUIRED', 'Only member accounts have a reading list.');
        }
        const { bookId, shelf, notes } = req.validated.body;
        const db = getDb();
        const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
        if (!book) throw domainError('BOOK_NOT_FOUND');

        const now = nowIso();
        db.prepare(
          `INSERT INTO reading_list (member_id, book_id, shelf, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (member_id, book_id) DO UPDATE SET
             shelf = excluded.shelf,
             notes = excluded.notes,
             updated_at = excluded.updated_at`
        ).run(req.user.memberId, bookId, shelf, notes, now, now);

        const item = db
          .prepare(
            `SELECT id, book_id AS bookId, shelf, notes, created_at AS createdAt, updated_at AS updatedAt
             FROM reading_list WHERE member_id = ? AND book_id = ?`
          )
          .get(req.user.memberId, bookId);
        res.status(201).json({ data: item });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    '/me/reading-list/:bookId',
    authenticate,
    requireRole('member'),
    validate({ params: readingBookParam, body: patchReadingSchema }),
    (req, res, next) => {
      try {
        const db = getDb();
        const { bookId } = req.validated.params;
        const existing = db
          .prepare('SELECT * FROM reading_list WHERE member_id = ? AND book_id = ?')
          .get(req.user.memberId, bookId);
        if (!existing) throw domainError('BOOK_NOT_FOUND', 'Item not in your reading list.');

        const nextShelf = req.validated.body.shelf ?? existing.shelf;
        const nextNotes = req.validated.body.notes ?? existing.notes;
        const now = nowIso();
        db.prepare(
          'UPDATE reading_list SET shelf = ?, notes = ?, updated_at = ? WHERE id = ?'
        ).run(nextShelf, nextNotes, now, existing.id);

        const updated = db
          .prepare(
            `SELECT id, book_id AS bookId, shelf, notes, created_at AS createdAt, updated_at AS updatedAt
             FROM reading_list WHERE id = ?`
          )
          .get(existing.id);
        res.json({ data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/me/reading-list/:bookId',
    authenticate,
    requireRole('member'),
    validate({ params: readingBookParam }),
    (req, res) => {
      getDb()
        .prepare('DELETE FROM reading_list WHERE member_id = ? AND book_id = ?')
        .run(req.user.memberId, req.validated.params.bookId);
      res.status(204).send();
    }
  );

  // --- Book Reviews & Ratings ---
  router.get('/books/:id/reviews', validate({ params: bookIdParam }), (req, res, next) => {
    try {
      const db = getDb();
      const bookId = req.validated.params.id;
      const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
      if (!book) throw domainError('BOOK_NOT_FOUND');

      const summary = db
        .prepare(
          `SELECT COUNT(*) AS reviewCount, ROUND(AVG(rating), 2) AS averageRating
           FROM book_reviews WHERE book_id = ?`
        )
        .get(bookId);

      const reviews = db
        .prepare(
          `SELECT r.id, r.book_id AS bookId, r.member_id AS memberId, r.rating, r.comment,
                  r.created_at AS createdAt, r.updated_at AS updatedAt,
                  m.first_name || ' ' || substr(m.last_name, 1, 1) || '.' AS reviewerName
           FROM book_reviews r
           JOIN members m ON m.id = r.member_id
           WHERE r.book_id = ?
           ORDER BY r.updated_at DESC, r.id DESC`
        )
        .all(bookId);

      res.json({
        data: {
          reviewCount: summary.reviewCount,
          averageRating: summary.averageRating ?? null,
          reviews,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/books/:id/reviews',
    authenticate,
    requireRole('member'),
    validate({ params: bookIdParam, body: upsertReviewSchema }),
    (req, res, next) => {
      try {
        if (!req.user.memberId) {
          throw new AppError(403, 'MEMBER_PROFILE_REQUIRED', 'Only member accounts can post reviews.');
        }
        const db = getDb();
        const bookId = req.validated.params.id;
        const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
        if (!book) throw domainError('BOOK_NOT_FOUND');

        const { rating, comment } = req.validated.body;
        const now = nowIso();
        withTransaction(db, req.user.id, () => {
          db.prepare(
            `INSERT INTO book_reviews (book_id, member_id, rating, comment, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (book_id, member_id) DO UPDATE SET
               rating = excluded.rating,
               comment = excluded.comment,
               updated_at = excluded.updated_at`
          ).run(bookId, req.user.memberId, rating, comment, now, now);
        });

        const review = db
          .prepare(
            `SELECT r.id, r.book_id AS bookId, r.member_id AS memberId, r.rating, r.comment,
                    r.created_at AS createdAt, r.updated_at AS updatedAt,
                    m.first_name || ' ' || substr(m.last_name, 1, 1) || '.' AS reviewerName
             FROM book_reviews r
             JOIN members m ON m.id = r.member_id
             WHERE r.book_id = ? AND r.member_id = ?`
          )
          .get(bookId, req.user.memberId);
        res.status(201).json({ data: review });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/reviews/:id',
    authenticate,
    requireRole('member', 'librarian'),
    validate({ params: reviewIdParam }),
    (req, res, next) => {
      try {
        const db = getDb();
        const row = db
          .prepare('SELECT id, member_id FROM book_reviews WHERE id = ?')
          .get(req.validated.params.id);
        if (!row) throw domainError('REVIEW_NOT_FOUND');

        if (req.user.role === 'member' && row.member_id !== req.user.memberId) {
          throw new AppError(403, 'FORBIDDEN', 'You can only delete your own review.');
        }

        db.prepare('DELETE FROM book_reviews WHERE id = ?').run(row.id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
