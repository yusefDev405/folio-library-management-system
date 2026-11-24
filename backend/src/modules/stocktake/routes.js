import { Router } from 'express';
import { z } from 'zod';
import { getDb, withTransaction } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { domainError, nowIso } from '../../utils/errors.js';

const sessionIdParam = z.object({ id: z.coerce.number().int().positive() });

const createSessionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  shelfPrefix: z.string().trim().max(32).optional().default(''),
});

const scanSchema = z.object({
  barcode: z.string().trim().min(1).max(32),
  scannedShelf: z.string().trim().max(64).optional().default(''),
});

function buildReconciliation(db, session) {
  const expectedWhere = ["c.status IN ('available', 'reserved')"];
  const expectedParams = [];
  if (session.category_id) {
    expectedWhere.push('b.category_id = ?');
    expectedParams.push(session.category_id);
  }
  if (session.shelf_prefix) {
    expectedWhere.push('c.shelf_location LIKE ?');
    expectedParams.push(`${session.shelf_prefix}%`);
  }

  const expectedCopies = db
    .prepare(
      `SELECT c.id, c.barcode, c.shelf_location AS shelfLocation, c.status,
              b.id AS bookId, b.title, b.category_id AS categoryId
       FROM book_copies c
       JOIN books b ON b.id = c.book_id
       WHERE ${expectedWhere.join(' AND ')}
       ORDER BY c.shelf_location ASC, c.barcode ASC`
    )
    .all(...expectedParams);

  const scans = db
    .prepare(
      `SELECT s.id, s.barcode, s.copy_id AS copyId, s.scanned_shelf AS scannedShelf, s.scanned_at AS scannedAt,
              c.shelf_location AS expectedShelf, c.status AS copyStatus,
              b.title, b.category_id AS categoryId
       FROM stocktake_scans s
       LEFT JOIN book_copies c ON c.id = s.copy_id
       LEFT JOIN books b ON b.id = c.book_id
       WHERE s.session_id = ?
       ORDER BY s.scanned_at DESC, s.id DESC`
    )
    .all(session.id);

  const expectedMap = new Map(expectedCopies.map((c) => [c.barcode.toUpperCase(), c]));
  const scannedBarcodes = new Set();

  const verified = [];
  const misplaced = [];
  const unexpected = [];

  for (const s of scans) {
    const key = s.barcode.toUpperCase();
    scannedBarcodes.add(key);

    if (!s.copyId) {
      unexpected.push({ ...s, classification: 'unknown_barcode' });
      continue;
    }

    const inExpected = expectedMap.has(key);
    const shelfMismatch =
      Boolean(s.scannedShelf) &&
      s.expectedShelf &&
      s.scannedShelf.toUpperCase() !== s.expectedShelf.toUpperCase();

    if (!inExpected || s.copyStatus === 'on_loan' || s.copyStatus === 'lost' || s.copyStatus === 'damaged') {
      unexpected.push({ ...s, classification: 'unexpected' });
    } else if (shelfMismatch) {
      misplaced.push({ ...s, classification: 'misplaced' });
    } else {
      verified.push({ ...s, classification: 'verified' });
    }
  }

  const missing = expectedCopies.filter((c) => !scannedBarcodes.has(c.barcode.toUpperCase()));

  return {
    session: {
      id: session.id,
      name: session.name,
      categoryId: session.category_id,
      categoryName: session.category_name ?? null,
      shelfPrefix: session.shelf_prefix,
      status: session.status,
      startedAt: session.started_at,
      closedAt: session.closed_at,
    },
    summary: {
      expectedCount: expectedCopies.length,
      scannedCount: scans.length,
      verifiedCount: verified.length,
      missingCount: missing.length,
      misplacedCount: misplaced.length,
      unexpectedCount: unexpected.length,
    },
    verified,
    missing,
    misplaced,
    unexpected,
  };
}

export function createStocktakeRouter() {
  const router = Router();

  router.get('/stocktakes', authenticate, requireRole('librarian'), (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT s.id, s.name, s.category_id AS categoryId, c.name AS categoryName,
                s.shelf_prefix AS shelfPrefix, s.status, s.started_at AS startedAt, s.closed_at AS closedAt,
                (SELECT COUNT(*) FROM stocktake_scans sc WHERE sc.session_id = s.id) AS scanCount
         FROM stocktake_sessions s
         LEFT JOIN categories c ON c.id = s.category_id
         ORDER BY s.id DESC`
      )
      .all();
    res.json({ data: rows });
  });

  router.post(
    '/stocktakes',
    authenticate,
    requireRole('librarian'),
    validate({ body: createSessionSchema }),
    (req, res) => {
      const db = getDb();
      const { name, categoryId, shelfPrefix } = req.validated.body;
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO stocktake_sessions (name, category_id, shelf_prefix, status, started_by, started_at)
           VALUES (?, ?, ?, 'open', ?, ?)`
        )
        .run(name, categoryId ?? null, shelfPrefix || '', req.user.id, now);

      const session = db
        .prepare(
          `SELECT s.*, c.name AS category_name
           FROM stocktake_sessions s
           LEFT JOIN categories c ON c.id = s.category_id
           WHERE s.id = ?`
        )
        .get(Number(info.lastInsertRowid));
      res.status(201).json({ data: buildReconciliation(db, session) });
    }
  );

  router.get(
    '/stocktakes/:id',
    authenticate,
    requireRole('librarian'),
    validate({ params: sessionIdParam }),
    (req, res, next) => {
      try {
        const db = getDb();
        const session = db
          .prepare(
            `SELECT s.*, c.name AS category_name
             FROM stocktake_sessions s
             LEFT JOIN categories c ON c.id = s.category_id
             WHERE s.id = ?`
          )
          .get(req.validated.params.id);
        if (!session) throw domainError('STOCKTAKE_NOT_FOUND');
        res.json({ data: buildReconciliation(db, session) });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/stocktakes/:id/scan',
    authenticate,
    requireRole('librarian'),
    validate({ params: sessionIdParam, body: scanSchema }),
    (req, res, next) => {
      try {
        const db = getDb();
        const session = db
          .prepare('SELECT * FROM stocktake_sessions WHERE id = ?')
          .get(req.validated.params.id);
        if (!session) throw domainError('STOCKTAKE_NOT_FOUND');
        if (session.status !== 'open') throw domainError('STOCKTAKE_CLOSED');

        const { barcode, scannedShelf } = req.validated.body;
        const copy = db
          .prepare(
            `SELECT c.id, c.barcode, c.shelf_location, c.status, b.title, b.category_id
             FROM book_copies c
             JOIN books b ON b.id = c.book_id
             WHERE c.barcode = ?`
          )
          .get(barcode);

        const now = nowIso();
        withTransaction(db, req.user.id, () => {
          db.prepare(
            `INSERT INTO stocktake_scans (session_id, barcode, copy_id, scanned_shelf, scanned_by, scanned_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (session_id, barcode) DO UPDATE SET
               scanned_shelf = excluded.scanned_shelf,
               scanned_at = excluded.scanned_at`
          ).run(session.id, copy?.barcode || barcode, copy?.id ?? null, scannedShelf || '', req.user.id, now);
        });

        let classification = 'unknown_barcode';
        if (copy) {
          const matchesCat = !session.category_id || copy.category_id === session.category_id;
          const matchesPrefix =
            !session.shelf_prefix ||
            copy.shelf_location.toUpperCase().startsWith(session.shelf_prefix.toUpperCase());
          const expectedStatus = ['available', 'reserved'].includes(copy.status);
          const shelfMismatch =
            Boolean(scannedShelf) &&
            copy.shelf_location.toUpperCase() !== scannedShelf.toUpperCase();

          if (!matchesCat || !matchesPrefix || !expectedStatus) {
            classification = 'unexpected';
          } else if (shelfMismatch) {
            classification = 'misplaced';
          } else {
            classification = 'verified';
          }
        }

        res.status(201).json({
          data: {
            barcode: copy?.barcode || barcode,
            title: copy?.title ?? null,
            expectedShelf: copy?.shelf_location ?? null,
            copyStatus: copy?.status ?? null,
            classification,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/stocktakes/:id/close',
    authenticate,
    requireRole('librarian'),
    validate({ params: sessionIdParam }),
    (req, res, next) => {
      try {
        const db = getDb();
        const session = db
          .prepare('SELECT * FROM stocktake_sessions WHERE id = ?')
          .get(req.validated.params.id);
        if (!session) throw domainError('STOCKTAKE_NOT_FOUND');

        if (session.status === 'open') {
          db.prepare("UPDATE stocktake_sessions SET status = 'closed', closed_at = ? WHERE id = ?").run(
            nowIso(),
            session.id
          );
        }
        const updated = db
          .prepare(
            `SELECT s.*, c.name AS category_name
             FROM stocktake_sessions s
             LEFT JOIN categories c ON c.id = s.category_id
             WHERE s.id = ?`
          )
          .get(session.id);
        res.json({ data: buildReconciliation(db, updated) });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
