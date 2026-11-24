import { withTransaction } from '../config/db.js';
import { addDaysIso, calculateOverdueFine, domainError, nowIso } from '../utils/errors.js';

/**
 * Transactional equivalent of MySQL sp_checkout_book.
 * Enforces member status/expiry, policy loan cap, unpaid fine cap,
 * reservation queue ownership for held copies, and copy availability.
 */
export function spCheckoutBook(db, { memberId, barcode, librarianId, now = nowIso() }) {
  return withTransaction(db, librarianId, () => {
    const copy = db
      .prepare(
        `SELECT c.id, c.book_id, c.status, c.barcode, b.title
         FROM book_copies c
         JOIN books b ON b.id = c.book_id
         WHERE c.barcode = ?`
      )
      .get(barcode);

    if (!copy) throw domainError('COPY_NOT_FOUND');

    const member = db
      .prepare(
        `SELECT m.id, m.member_number, m.first_name, m.last_name, m.status, m.expires_at, m.member_type
         FROM members m
         WHERE m.id = ?`
      )
      .get(memberId);

    if (!member) throw domainError('MEMBER_NOT_FOUND');

    const todayDate = now.slice(0, 10);
    if (member.status !== 'active' || member.expires_at.slice(0, 10) < todayDate) {
      throw domainError('MEMBER_NOT_ACTIVE');
    }

    const policy = db
      .prepare('SELECT * FROM loan_policies WHERE member_type = ?')
      .get(member.member_type);

    const activeRow = db
      .prepare('SELECT COUNT(*) AS cnt FROM loans WHERE member_id = ? AND returned_at IS NULL')
      .get(memberId);

    if (activeRow.cnt >= policy.max_loans) {
      throw domainError('LOAN_LIMIT_REACHED');
    }

    const unpaidRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM fines WHERE member_id = ? AND status = 'unpaid'")
      .get(memberId);

    if (Number(unpaidRow.total) > Number(policy.max_unpaid_fines)) {
      throw domainError('UNPAID_FINES');
    }

    let fulfilledReservationId = null;
    if (copy.status === 'reserved') {
      const readyRes = db
        .prepare(
          `SELECT id FROM reservations
           WHERE book_id = ? AND member_id = ? AND status = 'ready'
           ORDER BY reserved_at ASC, id ASC LIMIT 1`
        )
        .get(copy.book_id, memberId);

      if (!readyRes) {
        throw domainError('COPY_RESERVED');
      }

      db.prepare("UPDATE reservations SET status = 'fulfilled' WHERE id = ?").run(readyRes.id);
      fulfilledReservationId = readyRes.id;
    } else if (copy.status !== 'available') {
      throw domainError('COPY_NOT_AVAILABLE');
    }

    const dueAt = addDaysIso(now, policy.loan_days);
    const info = db
      .prepare(
        `INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, checked_out_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(copy.id, memberId, now, dueAt, librarianId);

    db.prepare("UPDATE book_copies SET status = 'on_loan' WHERE id = ?").run(copy.id);

    return {
      loanId: Number(info.lastInsertRowid),
      copyId: copy.id,
      bookId: copy.book_id,
      title: copy.title,
      barcode: copy.barcode,
      memberId: member.id,
      memberNumber: member.member_number,
      memberName: `${member.first_name} ${member.last_name}`,
      checkedOutAt: now,
      dueAt,
      fulfilledReservationId,
    };
  });
}

/**
 * Transactional equivalent of MySQL sp_return_book.
 * Closes the active loan, computes integer-cent overdue fines, and hands the
 * returned copy to the oldest waiting reservation (if any) or shelves it.
 */
export function spReturnBook(db, { barcode, actorUserId, now = nowIso() }) {
  return withTransaction(db, actorUserId, () => {
    const activeLoan = db
      .prepare(
        `SELECT l.id AS loan_id, l.copy_id, c.book_id, b.title, c.barcode,
                l.member_id, m.member_number, m.first_name, m.last_name,
                l.due_at, p.daily_fine, p.hold_days
         FROM loans l
         JOIN book_copies c ON c.id = l.copy_id
         JOIN books b ON b.id = c.book_id
         JOIN members m ON m.id = l.member_id
         JOIN loan_policies p ON p.member_type = m.member_type
         WHERE c.barcode = ? AND l.returned_at IS NULL`
      )
      .get(barcode);

    if (!activeLoan) {
      throw domainError('NO_ACTIVE_LOAN');
    }

    db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?').run(now, activeLoan.loan_id);

    const { daysLate, amount: fineAmount } = calculateOverdueFine(
      activeLoan.due_at,
      now,
      activeLoan.daily_fine
    );

    let fineId = null;
    if (fineAmount > 0) {
      const fineRes = db
        .prepare(
          `INSERT INTO fines (loan_id, member_id, amount, reason, status, assessed_at)
           VALUES (?, ?, ?, 'overdue', 'unpaid', ?)`
        )
        .run(activeLoan.loan_id, activeLoan.member_id, fineAmount, now);
      fineId = Number(fineRes.lastInsertRowid);
    }

    const nextWaiting = db
      .prepare(
        `SELECT r.id, r.member_id, m.member_number, m.first_name, m.last_name
         FROM reservations r
         JOIN members m ON m.id = r.member_id
         WHERE r.book_id = ? AND r.status = 'waiting'
         ORDER BY r.reserved_at ASC, r.id ASC
         LIMIT 1`
      )
      .get(activeLoan.book_id);

    let handedToReservation = null;
    if (nextWaiting) {
      const holdExpiresAt = addDaysIso(now, activeLoan.hold_days || 3);
      db.prepare(
        `UPDATE reservations
         SET status = 'ready', ready_at = ?, expires_at = ?
         WHERE id = ?`
      ).run(now, holdExpiresAt, nextWaiting.id);

      db.prepare("UPDATE book_copies SET status = 'reserved' WHERE id = ?").run(activeLoan.copy_id);

      handedToReservation = {
        reservationId: nextWaiting.id,
        memberId: nextWaiting.member_id,
        memberNumber: nextWaiting.member_number,
        memberName: `${nextWaiting.first_name} ${nextWaiting.last_name}`,
        expiresAt: holdExpiresAt,
      };
    } else {
      db.prepare("UPDATE book_copies SET status = 'available' WHERE id = ?").run(activeLoan.copy_id);
    }

    return {
      loanId: activeLoan.loan_id,
      copyId: activeLoan.copy_id,
      bookId: activeLoan.book_id,
      title: activeLoan.title,
      barcode: activeLoan.barcode,
      memberId: activeLoan.member_id,
      memberNumber: activeLoan.member_number,
      memberName: `${activeLoan.first_name} ${activeLoan.last_name}`,
      returnedAt: now,
      daysLate,
      fineAmount,
      fineId,
      copyStatus: nextWaiting ? 'reserved' : 'available',
      handedToReservation,
    };
  });
}

/**
 * Transactional equivalent of MySQL sp_renew_loan.
 * Enforces active membership, renewal cap, not overdue, unpaid fine limit,
 * and empty waiting queue before extending due_at.
 */
export function spRenewLoan(db, { loanId, actorUserId, now = nowIso() }) {
  return withTransaction(db, actorUserId, () => {
    const loan = db
      .prepare(
        `SELECT l.id, l.copy_id, l.member_id, l.due_at, l.returned_at, l.renewals_count,
                c.book_id, m.status AS member_status, m.expires_at,
                p.loan_days, p.max_renewals, p.max_unpaid_fines
         FROM loans l
         JOIN book_copies c ON c.id = l.copy_id
         JOIN members m ON m.id = l.member_id
         JOIN loan_policies p ON p.member_type = m.member_type
         WHERE l.id = ?`
      )
      .get(loanId);

    if (!loan || loan.returned_at !== null) {
      throw domainError('NO_ACTIVE_LOAN');
    }

    const todayDate = now.slice(0, 10);
    if (loan.member_status !== 'active' || loan.expires_at.slice(0, 10) < todayDate) {
      throw domainError('MEMBER_NOT_ACTIVE');
    }

    if (loan.renewals_count >= loan.max_renewals) {
      throw domainError('RENEWAL_LIMIT_REACHED');
    }

    if (loan.due_at < now) {
      throw domainError('LOAN_OVERDUE');
    }

    const unpaidRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM fines WHERE member_id = ? AND status = 'unpaid'")
      .get(loan.member_id);

    if (Number(unpaidRow.total) > Number(loan.max_unpaid_fines)) {
      throw domainError('UNPAID_FINES');
    }

    const waiting = db
      .prepare("SELECT 1 FROM reservations WHERE book_id = ? AND status = 'waiting' LIMIT 1")
      .get(loan.book_id);

    if (waiting) {
      throw domainError('BOOK_HAS_RESERVATIONS');
    }

    const baseTime = loan.due_at > now ? loan.due_at : now;
    const newDueAt = addDaysIso(baseTime, loan.loan_days);

    db.prepare(
      `UPDATE loans
       SET due_at = ?, renewals_count = renewals_count + 1
       WHERE id = ?`
    ).run(newDueAt, loan.id);

    return {
      loanId: loan.id,
      dueAt: newDueAt,
      renewalsCount: loan.renewals_count + 1,
    };
  });
}

/**
 * Transactional equivalent of MySQL sp_expire_holds / ev_expire_holds.
 * Expires ready reservations past expires_at and either promotes the next
 * waiting member or returns the held copy to 'available'.
 */
export function spExpireHolds(db, { actorUserId = null, now = nowIso() } = {}) {
  return withTransaction(db, actorUserId, () => {
    const expiredReady = db
      .prepare(
        `SELECT r.id, r.book_id
         FROM reservations r
         WHERE r.status = 'ready' AND datetime(r.expires_at) < datetime(?)
         ORDER BY r.expires_at ASC, r.id ASC`
      )
      .all(now);

    let expiredCount = 0;
    let promotedCount = 0;
    let releasedCount = 0;

    for (const row of expiredReady) {
      db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").run(row.id);
      expiredCount += 1;

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
        .get(row.book_id);

      if (nextWaiting) {
        const nextExpires = addDaysIso(now, nextWaiting.hold_days || 3);
        db.prepare(
          "UPDATE reservations SET status = 'ready', ready_at = ?, expires_at = ? WHERE id = ?"
        ).run(now, nextExpires, nextWaiting.id);
        promotedCount += 1;
      } else {
        const heldCopy = db
          .prepare("SELECT id FROM book_copies WHERE book_id = ? AND status = 'reserved' LIMIT 1")
          .get(row.book_id);
        if (heldCopy) {
          db.prepare("UPDATE book_copies SET status = 'available' WHERE id = ?").run(heldCopy.id);
          releasedCount += 1;
        }
      }
    }

    return { expiredCount, promotedCount, releasedCount };
  });
}

/**
 * Atomically marks a physical copy as 'lost' or 'damaged'.
 * If currently on loan, closes the loan and optionally assesses a replacement/damage fine
 * plus sends a fine_assessed notification to the member.
 */
export function spReportCopyIssue(
  db,
  { copyId, status, fineAmount = 0, actorUserId, now = nowIso() }
) {
  if (!['lost', 'damaged'].includes(status)) {
    throw domainError('INVALID_TRANSITION', 'Issue status must be lost or damaged.');
  }

  return withTransaction(db, actorUserId, () => {
    const copy = db
      .prepare(
        `SELECT c.id, c.book_id, c.barcode, c.shelf_location, c.status, b.title
         FROM book_copies c
         JOIN books b ON b.id = c.book_id
         WHERE c.id = ?`
      )
      .get(copyId);

    if (!copy) throw domainError('COPY_NOT_FOUND');

    const activeLoan = db
      .prepare(
        `SELECT l.id, l.member_id, m.user_id, m.member_number
         FROM loans l
         JOIN members m ON m.id = l.member_id
         WHERE l.copy_id = ? AND l.returned_at IS NULL`
      )
      .get(copyId);

    let closedLoanId = null;
    if (activeLoan) {
      db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?').run(now, activeLoan.id);
      closedLoanId = activeLoan.id;
    }

    db.prepare('UPDATE book_copies SET status = ? WHERE id = ?').run(status, copyId);

    let fineId = null;
    const normalizedFine = Number(Number(fineAmount || 0).toFixed(2));
    if (normalizedFine > 0 && activeLoan) {
      const fineInfo = db
        .prepare(
          `INSERT INTO fines (loan_id, member_id, amount, reason, status, assessed_at)
           VALUES (?, ?, ?, ?, 'unpaid', ?)`
        )
        .run(activeLoan.id, activeLoan.member_id, normalizedFine, status, now);
      fineId = Number(fineInfo.lastInsertRowid);

      db.prepare(
        `INSERT OR IGNORE INTO notifications (user_id, kind, title, body, dedupe_key, created_at)
         VALUES (?, 'fine_assessed', ?, ?, ?, ?)`
      ).run(
        activeLoan.user_id,
        `Fine assessed (${status})`,
        `A ${status} fee of $${normalizedFine.toFixed(2)} was assessed for "${copy.title}" (${copy.barcode}).`,
        `fine_${fineId}`,
        now
      );
    }

    const updatedCopy = db
      .prepare('SELECT id, book_id, barcode, shelf_location, status, acquired_at FROM book_copies WHERE id = ?')
      .get(copyId);

    return {
      copy: {
        id: updatedCopy.id,
        bookId: updatedCopy.book_id,
        barcode: updatedCopy.barcode,
        shelfLocation: updatedCopy.shelf_location,
        status: updatedCopy.status,
        acquiredAt: updatedCopy.acquired_at,
      },
      closedLoanId,
      fineId,
      fineAmount: fineId ? normalizedFine : 0,
    };
  });
}

/**
 * Idempotently generates in-app notifications for loans due within 3 days,
 * overdue loans, and ready reservation holds.
 */
export function spGenerateReminders(db, { now = nowIso() } = {}) {
  const today = now.slice(0, 10);
  const threeDaysOut = addDaysIso(now, 3);

  return withTransaction(db, null, () => {
    let created = 0;

    const dueSoonRows = db
      .prepare(
        `SELECT l.id AS loan_id, l.due_at, m.user_id, b.title, c.barcode
         FROM loans l
         JOIN members m ON m.id = l.member_id
         JOIN book_copies c ON c.id = l.copy_id
         JOIN books b ON b.id = c.book_id
         WHERE l.returned_at IS NULL
           AND datetime(l.due_at) >= datetime(?)
           AND datetime(l.due_at) <= datetime(?)`
      )
      .all(now, threeDaysOut);

    const insertNotif = db.prepare(
      `INSERT OR IGNORE INTO notifications (user_id, kind, title, body, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const r of dueSoonRows) {
      const dueDate = r.due_at.slice(0, 10);
      const res = insertNotif.run(
        r.user_id,
        'due_soon',
        `Due soon: ${r.title}`,
        `Copy ${r.barcode} is due on ${dueDate}. Renew in My Loans if eligible.`,
        `due_soon:${r.loan_id}:${dueDate}`,
        now
      );
      created += res.changes;
    }

    const overdueRows = db
      .prepare(
        `SELECT l.id AS loan_id, l.due_at, m.user_id, b.title, c.barcode
         FROM loans l
         JOIN members m ON m.id = l.member_id
         JOIN book_copies c ON c.id = l.copy_id
         JOIN books b ON b.id = c.book_id
         WHERE l.returned_at IS NULL AND datetime(l.due_at) < datetime(?)`
      )
      .all(now);

    for (const r of overdueRows) {
      const res = insertNotif.run(
        r.user_id,
        'overdue',
        `Overdue item: ${r.title}`,
        `Copy ${r.barcode} passed its due date (${r.due_at.slice(0, 10)}). Please return it to avoid additional fines.`,
        `overdue:${r.loan_id}:${today}`,
        now
      );
      created += res.changes;
    }

    const readyRows = db
      .prepare(
        `SELECT r.id AS res_id, r.expires_at, m.user_id, b.title
         FROM reservations r
         JOIN members m ON m.id = r.member_id
         JOIN books b ON b.id = r.book_id
         WHERE r.status = 'ready'`
      )
      .all();

    for (const r of readyRows) {
      const exp = (r.expires_at || '').slice(0, 10);
      const res = insertNotif.run(
        r.user_id,
        'hold_ready',
        `Hold ready for pickup: ${r.title}`,
        `Your reserved copy is waiting on the Hold Shelf until ${exp}.`,
        `hold_ready:${r.res_id}`,
        now
      );
      created += res.changes;
    }

    return { created };
  });
}
