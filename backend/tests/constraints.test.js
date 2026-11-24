import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestEnv } from './helpers.js';

test('Database constraints reject invalid states even when stored procedures are bypassed', async () => {
  const env = await createTestEnv();
  const { db } = env;
  try {
    // 1. Multiple closed loans for the same copy ARE allowed
    db.prepare(
      `INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, returned_at)
       VALUES (1, 1, '2026-01-01T10:00:00Z', '2026-01-15T10:00:00Z', '2026-01-10T10:00:00Z')`
    ).run();
    db.prepare(
      `INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, returned_at)
       VALUES (1, 2, '2026-02-01T10:00:00Z', '2026-02-15T10:00:00Z', '2026-02-10T10:00:00Z')`
    ).run();

    // 2. Two OPEN loans for the same copy are rejected by uq_loans_one_active_per_copy (generated column)
    db.prepare(
      `INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, returned_at)
       VALUES (1, 1, '2026-03-01T10:00:00Z', '2026-03-15T10:00:00Z', NULL)`
    ).run();
    assert.throws(() => {
      db.prepare(
        `INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, returned_at)
         VALUES (1, 2, '2026-03-02T10:00:00Z', '2026-03-16T10:00:00Z', NULL)`
      ).run();
    }, /uq_loans_one_active_per_copy|UNIQUE constraint failed/);

    // 3. CHECK (due_at > checked_out_at) rejects due_at <= checked_out_at
    assert.throws(() => {
      db.prepare(
        `INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, returned_at)
         VALUES (2, 1, '2026-03-10T10:00:00Z', '2026-03-05T10:00:00Z', NULL)`
      ).run();
    }, /CHECK constraint failed/);

    // 4. CHECK (amount > 0) rejects zero or negative fines
    assert.throws(() => {
      db.prepare(
        `INSERT INTO fines (loan_id, member_id, amount, reason, status)
         VALUES (1, 1, 0, 'overdue', 'unpaid')`
      ).run();
    }, /CHECK constraint failed/);

    // 5. Unique open reservation per member + book
    db.prepare("INSERT INTO reservations (book_id, member_id, status) VALUES (1, 1, 'waiting')").run();
    assert.throws(() => {
      db.prepare("INSERT INTO reservations (book_id, member_id, status) VALUES (1, 1, 'waiting')").run();
    }, /uq_reservations_one_open|UNIQUE constraint failed/);

    // 6. ON DELETE RESTRICT protects loan history
    assert.throws(() => {
      db.prepare('DELETE FROM book_copies WHERE id = 1').run();
    }, /FOREIGN KEY constraint failed/);
  } finally {
    env.cleanup();
  }
});
