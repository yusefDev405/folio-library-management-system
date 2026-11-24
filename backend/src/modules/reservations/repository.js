import { getDb, withTransaction } from '../../config/db.js';
import { addDaysIso, domainError, nowIso } from '../../utils/errors.js';

export function createReservation({ bookId, memberId, actorUserId }) {
  const db = getDb();
  const now = nowIso();

  return withTransaction(db, actorUserId, () => {
    const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(bookId);
    if (!book) throw domainError('BOOK_NOT_FOUND');

    const member = db
      .prepare('SELECT id, status, expires_at FROM members WHERE id = ?')
      .get(memberId);
    if (!member) throw domainError('MEMBER_NOT_FOUND');

    if (member.status !== 'active' || member.expires_at.slice(0, 10) < now.slice(0, 10)) {
      throw domainError('MEMBER_NOT_ACTIVE');
    }

    const available = db
      .prepare("SELECT COUNT(*) AS cnt FROM book_copies WHERE book_id = ? AND status = 'available'")
      .get(bookId).cnt;
    if (available > 0) {
      throw domainError('COPY_AVAILABLE_NO_RESERVE');
    }

    const info = db
      .prepare(
        `INSERT INTO reservations (book_id, member_id, reserved_at, status)
         VALUES (?, ?, ?, 'waiting')`
      )
      .run(bookId, memberId, now);

    const reservationId = Number(info.lastInsertRowid);
    return findReservationById(reservationId);
  });
}

export function findReservationById(reservationId) {
  return getDb()
    .prepare(
      `SELECT r.id, r.book_id, r.member_id, r.reserved_at, r.status, r.ready_at, r.expires_at,
              b.title, b.isbn,
              CASE
                WHEN r.status = 'waiting' THEN (
                  SELECT COUNT(*) FROM reservations r2
                  WHERE r2.book_id = r.book_id
                    AND r2.status = 'waiting'
                    AND (r2.reserved_at < r.reserved_at OR (r2.reserved_at = r.reserved_at AND r2.id <= r.id))
                )
                ELSE NULL
              END AS queue_position
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       WHERE r.id = ?`
    )
    .get(reservationId);
}

export function listMemberReservations(memberId) {
  return getDb()
    .prepare(
      `SELECT r.id, r.book_id, r.member_id, r.reserved_at, r.status, r.ready_at, r.expires_at,
              b.title, b.isbn,
              CASE
                WHEN r.status = 'waiting' THEN (
                  SELECT COUNT(*) FROM reservations r2
                  WHERE r2.book_id = r.book_id
                    AND r2.status = 'waiting'
                    AND (r2.reserved_at < r.reserved_at OR (r2.reserved_at = r.reserved_at AND r2.id <= r.id))
                )
                ELSE NULL
              END AS queue_position
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       WHERE r.member_id = ?
       ORDER BY CASE r.status WHEN 'ready' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, r.reserved_at DESC`
    )
    .all(memberId);
}

export function cancelReservation(reservationId, actorUserId) {
  const db = getDb();
  const now = nowIso();

  return withTransaction(db, actorUserId, () => {
    const resRow = db
      .prepare('SELECT id, book_id, status FROM reservations WHERE id = ?')
      .get(reservationId);
    if (!resRow) throw domainError('RESERVATION_NOT_FOUND');
    if (!['waiting', 'ready'].includes(resRow.status)) {
      throw domainError('RESERVATION_NOT_ACTIVE');
    }

    const wasReady = resRow.status === 'ready';
    db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(reservationId);

    // If a ready hold was cancelled, promote the next waiting member or release the copy
    if (wasReady) {
      const nextWaiting = db
        .prepare(
          `SELECT r.id, p.hold_days
           FROM reservations r
           JOIN members m ON m.id = r.member_id
           JOIN loan_policies p ON p.member_type = m.member_type
           WHERE r.book_id = ? AND r.status = 'waiting'
           ORDER BY r.reserved_at ASC, r.id ASC
           LIMIT 1`
        )
        .get(resRow.book_id);

      if (nextWaiting) {
        const expiresAt = addDaysIso(now, nextWaiting.hold_days || 3);
        db.prepare(
          "UPDATE reservations SET status = 'ready', ready_at = ?, expires_at = ? WHERE id = ?"
        ).run(now, expiresAt, nextWaiting.id);
      } else {
        const heldCopy = db
          .prepare("SELECT id FROM book_copies WHERE book_id = ? AND status = 'reserved' LIMIT 1")
          .get(resRow.book_id);
        if (heldCopy) {
          db.prepare("UPDATE book_copies SET status = 'available' WHERE id = ?").run(heldCopy.id);
        }
      }
    }
  });
}

export function listAllReservations({ status } = {}) {
  const db = getDb();
  const where = status ? 'WHERE r.status = ?' : "WHERE r.status IN ('ready', 'waiting')";
  const params = status ? [status] : [];

  return db
    .prepare(
      `SELECT r.id, r.book_id AS bookId, b.title, b.isbn,
              r.member_id AS memberId, m.member_number AS memberNumber,
              m.first_name || ' ' || m.last_name AS memberName,
              r.reserved_at AS reservedAt, r.status, r.ready_at AS readyAt, r.expires_at AS expiresAt,
              (
                SELECT c.barcode FROM book_copies c
                WHERE c.book_id = r.book_id AND c.status = 'reserved'
                ORDER BY c.id ASC LIMIT 1
              ) AS heldBarcode,
              CASE
                WHEN r.status = 'waiting' THEN (
                  SELECT COUNT(*) FROM reservations r2
                  WHERE r2.book_id = r.book_id AND r2.status = 'waiting'
                    AND (r2.reserved_at < r.reserved_at OR (r2.reserved_at = r.reserved_at AND r2.id <= r.id))
                )
                ELSE NULL
              END AS queuePosition
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       JOIN members m ON m.id = r.member_id
       ${where}
       ORDER BY CASE r.status WHEN 'ready' THEN 0 ELSE 1 END, r.reserved_at ASC, r.id ASC`
    )
    .all(...params);
}
