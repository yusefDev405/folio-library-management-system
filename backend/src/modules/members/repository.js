import { getDb, withTransaction } from '../../config/db.js';
import { domainError } from '../../utils/errors.js';

export function listMembers({ q, status, memberType, limit, offset }) {
  const db = getDb();
  const where = [];
  const params = [];

  if (q) {
    where.push(
      "(m.member_number LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ? OR u.email LIKE ?)"
    );
    const pat = `%${q}%`;
    params.push(pat, pat, pat, pat);
  }
  if (status) {
    where.push('m.status = ?');
    params.push(status);
  }
  if (memberType) {
    where.push('m.member_type = ?');
    params.push(memberType);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM members m
       JOIN users u ON u.id = m.user_id
       ${whereSql}`
    )
    .get(...params).cnt;

  const rows = db
    .prepare(
      `SELECT m.id, m.user_id, m.member_number, m.first_name, m.last_name, m.phone,
              m.member_type, m.status, m.joined_at, m.expires_at,
              u.email,
              p.max_loans, p.max_unpaid_fines,
              s.active_loans, s.overdue_loans, s.unpaid_fines
       FROM members m
       JOIN users u ON u.id = m.user_id
       JOIN loan_policies p ON p.member_type = m.member_type
       JOIN v_member_loan_summary s ON s.member_id = m.id
       ${whereSql}
       ORDER BY m.last_name ASC, m.first_name ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { rows, total };
}

export function findMemberById(memberId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT m.id, m.user_id, m.member_number, m.first_name, m.last_name, m.phone,
              m.member_type, m.status, m.joined_at, m.expires_at,
              u.email, u.is_active,
              p.max_loans, p.loan_days, p.max_renewals, p.daily_fine, p.max_unpaid_fines,
              s.active_loans, s.overdue_loans, s.unpaid_fines
       FROM members m
       JOIN users u ON u.id = m.user_id
       JOIN loan_policies p ON p.member_type = m.member_type
       JOIN v_member_loan_summary s ON s.member_id = m.id
       WHERE m.id = ?`
    )
    .get(memberId);

  if (!row) return null;

  const activeLoans = db
    .prepare(
      `SELECT l.id, l.copy_id, l.checked_out_at, l.due_at, l.renewals_count,
              c.barcode, b.id AS book_id, b.title, b.isbn
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       WHERE l.member_id = ? AND l.returned_at IS NULL
       ORDER BY l.due_at ASC`
    )
    .all(memberId);

  const unpaidFines = db
    .prepare(
      `SELECT f.id, f.loan_id, f.amount, f.reason, f.status, f.assessed_at
       FROM fines f
       WHERE f.member_id = ? AND f.status = 'unpaid'
       ORDER BY f.assessed_at DESC`
    )
    .all(memberId);

  return { row, activeLoans, unpaidFines };
}

export function createMember({
  email,
  passwordHash,
  memberNumber,
  firstName,
  lastName,
  phone,
  memberType,
  expiresAt,
  actorUserId,
}) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const userInfo = db
      .prepare("INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'member', 1)")
      .run(email, passwordHash);
    const userId = Number(userInfo.lastInsertRowid);

    const memberInfo = db
      .prepare(
        `INSERT INTO members (user_id, member_number, first_name, last_name, phone, member_type, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
      )
      .run(userId, memberNumber, firstName, lastName, phone ?? null, memberType, expiresAt);

    return Number(memberInfo.lastInsertRowid);
  });
}

export function updateMember(memberId, fields, actorUserId) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const existing = db.prepare('SELECT id FROM members WHERE id = ?').get(memberId);
    if (!existing) throw domainError('MEMBER_NOT_FOUND');

    const sets = [];
    const params = [];
    if (fields.firstName !== undefined) {
      sets.push('first_name = ?');
      params.push(fields.firstName);
    }
    if (fields.lastName !== undefined) {
      sets.push('last_name = ?');
      params.push(fields.lastName);
    }
    if (fields.phone !== undefined) {
      sets.push('phone = ?');
      params.push(fields.phone);
    }
    if (fields.memberType !== undefined) {
      sets.push('member_type = ?');
      params.push(fields.memberType);
    }
    if (fields.status !== undefined) {
      sets.push('status = ?');
      params.push(fields.status);
    }
    if (fields.expiresAt !== undefined) {
      sets.push('expires_at = ?');
      params.push(fields.expiresAt);
    }

    if (sets.length > 0) {
      params.push(memberId);
      db.prepare(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }
  });
}
