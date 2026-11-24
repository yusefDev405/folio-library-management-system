import assert from 'node:assert/strict';
import test from 'node:test';
import { createBookSchema } from '../src/modules/books/schema.js';
import { calculateOverdueFine, domainError } from '../src/utils/errors.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { signAccessToken, verifyAccessToken } from '../src/utils/tokens.js';

test('calculateOverdueFine computes exact integer cents without float drift', () => {
  assert.deepEqual(calculateOverdueFine('2026-05-10T12:00:00Z', '2026-05-10T23:59:00Z', 0.5), {
    daysLate: 0,
    amount: 0,
  });
  assert.deepEqual(calculateOverdueFine('2026-05-10T12:00:00Z', '2026-05-08T12:00:00Z', 0.5), {
    daysLate: 0,
    amount: 0,
  });
  assert.deepEqual(calculateOverdueFine('2026-05-10T12:00:00Z', '2026-05-13T09:00:00Z', 0.35), {
    daysLate: 3,
    amount: 1.05,
  });
});

test('domainError maps procedural signal codes to proper HTTP statuses', () => {
  assert.equal(domainError('COPY_NOT_FOUND').status, 404);
  assert.equal(domainError('NO_ACTIVE_LOAN').status, 404);
  assert.equal(domainError('LOAN_LIMIT_REACHED').status, 409);
  assert.equal(domainError('UNPAID_FINES').status, 409);
  assert.equal(domainError('COPY_RESERVED').status, 409);
});

test('scrypt password hashing verifies valid passwords and rejects wrong ones', async () => {
  const hash = await hashPassword('StrongPass123!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword('StrongPass123!', hash), true);
  assert.equal(await verifyPassword('WrongPass123!', hash), false);
});

test('JWT token helpers sign and verify sub, role, and memberId', () => {
  const token = signAccessToken({ userId: 42, role: 'member', memberId: 7 });
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.sub, '42');
  assert.equal(decoded.role, 'member');
  assert.equal(decoded.memberId, 7);
});

test('createBookSchema strips hyphens from ISBN and rejects invalid fields', () => {
  const parsed = createBookSchema.parse({
    isbn: '978-0-13-468599-1',
    title: 'Effective Java',
    authorIds: [1],
    injectedRole: 'admin',
  });
  assert.equal(parsed.isbn, '9780134685991');
  assert.equal('injectedRole' in parsed, false);
});
