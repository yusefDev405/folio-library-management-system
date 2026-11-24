import assert from 'node:assert/strict';
import test from 'node:test';
import {
  spCheckoutBook,
  spExpireHolds,
  spRenewLoan,
  spReturnBook,
} from '../src/db/procedures.js';
import { createTestEnv } from './helpers.js';

test('spCheckoutBook enforces member status, expiry, loan limit, unpaid fines, and copy status', async () => {
  const env = await createTestEnv();
  const { db } = env;
  try {
    // Expired member blocked
    assert.throws(
      () => spCheckoutBook(db, { memberId: 3, barcode: 'BC-101', librarianId: 2 }),
      (e) => e.code === 'MEMBER_NOT_ACTIVE'
    );

    // Suspended member blocked
    assert.throws(
      () => spCheckoutBook(db, { memberId: 4, barcode: 'BC-101', librarianId: 2 }),
      (e) => e.code === 'MEMBER_NOT_ACTIVE'
    );

    // Damaged copy blocked
    assert.throws(
      () => spCheckoutBook(db, { memberId: 1, barcode: 'BC-202', librarianId: 2 }),
      (e) => e.code === 'COPY_NOT_AVAILABLE'
    );

    // Valid checkout succeeds and logs audit record
    const loan = spCheckoutBook(db, {
      memberId: 1,
      barcode: 'BC-101',
      librarianId: 2,
      now: '2026-11-01T10:00:00Z',
    });
    assert.equal(loan.barcode, 'BC-101');
    assert.equal(
      db.prepare('SELECT status FROM book_copies WHERE barcode = ?').get('BC-101').status,
      'on_loan'
    );
    const audit = db
      .prepare("SELECT * FROM audit_log WHERE entity = 'loans' AND entity_id = ?")
      .get(loan.loanId);
    assert.equal(audit.actor_user_id, 2);

    // Copy already on loan blocked
    assert.throws(
      () => spCheckoutBook(db, { memberId: 2, barcode: 'BC-101', librarianId: 2 }),
      (e) => e.code === 'COPY_NOT_AVAILABLE'
    );

    // Enforce max_loans (external policy = 3)
    db.prepare('UPDATE loan_policies SET max_loans = 1 WHERE member_type = ?').run('external');
    spCheckoutBook(db, { memberId: 2, barcode: 'BC-102', librarianId: 2 });
    assert.throws(
      () => spCheckoutBook(db, { memberId: 2, barcode: 'BC-201', librarianId: 2 }),
      (e) => e.code === 'LOAN_LIMIT_REACHED'
    );

    // Unpaid fines above threshold block checkout
    db.prepare(
      "INSERT INTO fines (loan_id, member_id, amount, reason, status) VALUES (?, 1, 25.00, 'overdue', 'unpaid')"
    ).run(loan.loanId);
    assert.throws(
      () => spCheckoutBook(db, { memberId: 1, barcode: 'BC-201', librarianId: 2 }),
      (e) => e.code === 'UNPAID_FINES'
    );
  } finally {
    env.cleanup();
  }
});

test('spReturnBook calculates overdue fine, promotes FIFO waiting reservation, and spExpireHolds rotates holds', async () => {
  const env = await createTestEnv();
  const { db } = env;
  try {
    const loan = spCheckoutBook(db, {
      memberId: 1,
      barcode: 'BC-101',
      librarianId: 2,
      now: '2026-10-01T10:00:00Z',
    });

    // Queue Bob (#2) waiting for Book 1
    db.prepare(
      "INSERT INTO reservations (book_id, member_id, reserved_at, status) VALUES (1, 2, '2026-10-05T10:00:00Z', 'waiting')"
    ).run();

    // Renewal blocked because Bob is waiting
    assert.throws(
      () => spRenewLoan(db, { loanId: loan.loanId, actorUserId: 3, now: '2026-10-10T10:00:00Z' }),
      (e) => e.code === 'BOOK_HAS_RESERVATIONS'
    );

    // Return 5 days late (due 2026-10-15, returned 2026-10-20; student rate = 0.50/day => 2.50)
    const ret = spReturnBook(db, {
      barcode: 'BC-101',
      actorUserId: 2,
      now: '2026-10-20T10:00:00Z',
    });
    assert.equal(ret.daysLate, 5);
    assert.equal(ret.fineAmount, 2.5);
    assert.equal(ret.copyStatus, 'reserved');
    assert.equal(ret.handedToReservation.memberId, 2);

    // Returning again fails with NO_ACTIVE_LOAN
    assert.throws(
      () => spReturnBook(db, { barcode: 'BC-101', actorUserId: 2 }),
      (e) => e.code === 'NO_ACTIVE_LOAN'
    );

    // Alice cannot steal Bob's held copy
    assert.throws(
      () => spCheckoutBook(db, { memberId: 1, barcode: 'BC-101', librarianId: 2 }),
      (e) => e.code === 'COPY_RESERVED'
    );

    // Simulate Bob's hold expiring in the past -> spExpireHolds releases copy back to available
    db.prepare("UPDATE reservations SET expires_at = '2026-10-21T00:00:00Z' WHERE member_id = 2").run();
    const expired = spExpireHolds(db, { actorUserId: 1, now: '2026-10-25T00:00:00Z' });
    assert.equal(expired.expiredCount, 1);
    assert.equal(expired.releasedCount, 1);
    assert.equal(
      db.prepare('SELECT status FROM book_copies WHERE barcode = ?').get('BC-101').status,
      'available'
    );
  } finally {
    env.cleanup();
  }
});
