import { getDb, withTransaction } from '../../config/db.js';
import { domainError, nowIso } from '../../utils/errors.js';

export function listMemberFines(memberId) {
  return getDb()
    .prepare(
      `SELECT f.id, f.loan_id, f.member_id, f.amount, f.reason, f.status, f.assessed_at, f.paid_at,
              b.title, c.barcode
       FROM fines f
       JOIN loans l ON l.id = f.loan_id
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       WHERE f.member_id = ?
       ORDER BY CASE f.status WHEN 'unpaid' THEN 0 ELSE 1 END, f.assessed_at DESC`
    )
    .all(memberId);
}

export function listFines({ status, memberId, limit, offset }) {
  const db = getDb();
  const where = [];
  const params = [];

  if (status) {
    where.push('f.status = ?');
    params.push(status);
  }
  if (memberId) {
    where.push('f.member_id = ?');
    params.push(memberId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db
    .prepare(`SELECT COUNT(*) AS cnt FROM fines f ${whereSql}`)
    .get(...params).cnt;

  const rows = db
    .prepare(
      `SELECT f.id, f.loan_id, f.member_id, f.amount, f.reason, f.status, f.assessed_at, f.paid_at,
              m.member_number, m.first_name || ' ' || m.last_name AS member_name,
              b.title, c.barcode
       FROM fines f
       JOIN members m ON m.id = f.member_id
       JOIN loans l ON l.id = f.loan_id
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       ${whereSql}
       ORDER BY CASE f.status WHEN 'unpaid' THEN 0 ELSE 1 END, f.assessed_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { rows, total };
}

export function settleFine(fineId, targetStatus, actorUserId) {
  const db = getDb();
  const now = nowIso();

  return withTransaction(db, actorUserId, () => {
    const fine = db.prepare('SELECT id, status FROM fines WHERE id = ?').get(fineId);
    if (!fine) throw domainError('FINE_NOT_FOUND');
    if (fine.status !== 'unpaid') throw domainError('FINE_ALREADY_SETTLED');

    const paidAt = targetStatus === 'paid' ? now : null;
    db.prepare('UPDATE fines SET status = ?, paid_at = ? WHERE id = ?').run(
      targetStatus,
      paidAt,
      fineId
    );

    return db
      .prepare(
        `SELECT f.id, f.loan_id, f.member_id, f.amount, f.reason, f.status, f.assessed_at, f.paid_at,
                b.title, c.barcode
         FROM fines f
         JOIN loans l ON l.id = f.loan_id
         JOIN book_copies c ON c.id = l.copy_id
         JOIN books b ON b.id = c.book_id
         WHERE f.id = ?`
      )
      .get(fineId);
  });
}
