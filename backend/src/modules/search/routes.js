import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db.js';
import { hasRoleOrHigher } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { verifyAccessToken } from '../../utils/tokens.js';

const quickQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
});

function tryGetUserRole(req) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    const payload = verifyAccessToken(header.slice(7).trim());
    return payload.role || null;
  } catch {
    return null;
  }
}

export function createSearchRouter() {
  const router = Router();

  router.get('/search/quick', validate({ query: quickQuerySchema }), (req, res) => {
    const q = req.validated.query.q;
    const pat = `%${q}%`;
    const db = getDb();
    const role = tryGetUserRole(req);

    const books = db
      .prepare(
        `SELECT b.id, b.title, b.isbn, v.available_copies AS availableCopies, v.total_copies AS totalCopies
         FROM books b
         JOIN v_book_availability v ON v.book_id = b.id
         WHERE b.title LIKE ? OR b.isbn LIKE ?
         ORDER BY b.title ASC
         LIMIT 6`
      )
      .all(pat, pat);

    let members = [];
    let copies = [];
    if (role && hasRoleOrHigher(role, 'librarian')) {
      members = db
        .prepare(
          `SELECT id, member_number AS memberNumber, first_name || ' ' || last_name AS name, member_type AS memberType, status
           FROM members
           WHERE member_number LIKE ? OR first_name LIKE ? OR last_name LIKE ?
           ORDER BY last_name ASC
           LIMIT 5`
        )
        .all(pat, pat, pat);

      copies = db
        .prepare(
          `SELECT c.id, c.barcode, c.shelf_location AS shelfLocation, c.status, b.id AS bookId, b.title
           FROM book_copies c
           JOIN books b ON b.id = c.book_id
           WHERE c.barcode LIKE ?
           ORDER BY c.barcode ASC
           LIMIT 5`
        )
        .all(pat);
    }

    res.json({ data: { books, members, copies } });
  });

  return router;
}
