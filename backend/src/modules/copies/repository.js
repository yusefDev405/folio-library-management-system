import { getDb, withTransaction } from '../../config/db.js';
import { spReportCopyIssue } from '../../db/procedures.js';
import { domainError } from '../../utils/errors.js';

export function createCopy({ bookId, barcode, shelfLocation, actorUserId }) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
    if (!book) throw domainError('BOOK_NOT_FOUND');

    const info = db
      .prepare(
        `INSERT INTO book_copies (book_id, barcode, shelf_location, status)
         VALUES (?, ?, ?, 'available')`
      )
      .run(bookId, barcode, shelfLocation);

    return db
      .prepare('SELECT id, book_id, barcode, shelf_location, status, acquired_at FROM book_copies WHERE id = ?')
      .get(Number(info.lastInsertRowid));
  });
}

export function updateCopy(copyId, { shelfLocation, status }, actorUserId) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const copy = db
      .prepare('SELECT id, book_id, barcode, shelf_location, status, acquired_at FROM book_copies WHERE id = ?')
      .get(copyId);
    if (!copy) throw domainError('COPY_NOT_FOUND');

    if (status !== undefined && (copy.status === 'on_loan' || copy.status === 'reserved')) {
      throw domainError('INVALID_TRANSITION');
    }

    const nextLocation = shelfLocation ?? copy.shelf_location;
    const nextStatus = status ?? copy.status;

    db.prepare('UPDATE book_copies SET shelf_location = ?, status = ? WHERE id = ?').run(
      nextLocation,
      nextStatus,
      copyId
    );

    return db
      .prepare('SELECT id, book_id, barcode, shelf_location, status, acquired_at FROM book_copies WHERE id = ?')
      .get(copyId);
  });
}

export function getCopyHistory(copyId) {
  const db = getDb();
  const copy = db
    .prepare(
      `SELECT c.id, c.book_id AS bookId, b.title, b.isbn, c.barcode, c.shelf_location AS shelfLocation,
              c.status, c.acquired_at AS acquiredAt
       FROM book_copies c
       JOIN books b ON b.id = c.book_id
       WHERE c.id = ?`
    )
    .get(copyId);
  if (!copy) throw domainError('COPY_NOT_FOUND');

  const loans = db
    .prepare(
      `SELECT l.id, l.member_id AS memberId, m.member_number AS memberNumber,
              m.first_name || ' ' || m.last_name AS memberName,
              l.checked_out_at AS checkedOutAt, l.due_at AS dueAt, l.returned_at AS returnedAt,
              l.renewals_count AS renewalsCount
       FROM loans l
       JOIN members m ON m.id = l.member_id
       WHERE l.copy_id = ?
       ORDER BY l.checked_out_at DESC, l.id DESC`
    )
    .all(copyId);

  return { copy, loans };
}

export function reportCopyIssue(copyId, { status, fineAmount }, actorUserId) {
  return spReportCopyIssue(getDb(), { copyId, status, fineAmount, actorUserId });
}
