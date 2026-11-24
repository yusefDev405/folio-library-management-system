import { getDb } from '../../config/db.js';
import { spCheckoutBook, spRenewLoan, spReturnBook } from '../../db/procedures.js';

export function checkout(params) {
  return spCheckoutBook(getDb(), params);
}

export function returnBook(params) {
  return spReturnBook(getDb(), params);
}

export function renewLoan(params) {
  return spRenewLoan(getDb(), params);
}

export function findLoanOwnership(loanId) {
  return getDb()
    .prepare('SELECT id, member_id FROM loans WHERE id = ?')
    .get(loanId);
}

export function listLoans({ status, memberId, limit, offset }) {
  const db = getDb();
  const where = [];
  const params = [];

  if (status === 'active') {
    where.push('l.returned_at IS NULL');
  } else if (status === 'overdue') {
    where.push("l.returned_at IS NULL AND datetime(l.due_at) < datetime('now')");
  } else if (status === 'returned') {
    where.push('l.returned_at IS NOT NULL');
  }

  if (memberId) {
    where.push('l.member_id = ?');
    params.push(memberId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS cnt FROM loans l ${whereSql}`)
    .get(...params).cnt;

  const rows = db
    .prepare(
      `SELECT l.id, l.copy_id, l.member_id, l.checked_out_at, l.due_at, l.returned_at, l.renewals_count,
              c.barcode, b.id AS book_id, b.title, b.isbn,
              m.member_number, m.first_name || ' ' || m.last_name AS member_name,
              p.max_renewals,
              CASE
                WHEN l.returned_at IS NULL AND datetime(l.due_at) < datetime('now') THEN 1
                ELSE 0
              END AS is_overdue
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN members m ON m.id = l.member_id
       JOIN loan_policies p ON p.member_type = m.member_type
       ${whereSql}
       ORDER BY l.checked_out_at DESC, l.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { rows, total };
}

export function listMemberLoans({ memberId, history = false, limit, offset }) {
  const db = getDb();
  const cond = history ? 'l.returned_at IS NOT NULL' : 'l.returned_at IS NULL';
  const total = db
    .prepare(`SELECT COUNT(*) AS cnt FROM loans l WHERE l.member_id = ? AND ${cond}`)
    .get(memberId).cnt;

  const rows = db
    .prepare(
      `SELECT l.id, l.copy_id, l.member_id, l.checked_out_at, l.due_at, l.returned_at, l.renewals_count,
              c.barcode, b.id AS book_id, b.title, b.isbn,
              p.max_renewals,
              CASE
                WHEN l.returned_at IS NULL AND datetime(l.due_at) < datetime('now') THEN 1
                ELSE 0
              END AS is_overdue
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       JOIN members m ON m.id = l.member_id
       JOIN loan_policies p ON p.member_type = m.member_type
       WHERE l.member_id = ? AND ${cond}
       ORDER BY l.due_at ASC, l.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(memberId, limit, offset);

  return { rows, total };
}
