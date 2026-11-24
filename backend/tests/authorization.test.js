import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { spCheckoutBook } from '../src/db/procedures.js';
import { createTestEnv, loginAs, startTestServer } from './helpers.js';

test('RBAC and ownership checks prevent cross-member access and privilege escalation', async () => {
  const env = await createTestEnv();
  const app = createApp({ enableRateLimit: false });
  const srv = await startTestServer(app);

  try {
    // Create an active loan and unpaid fine for Alice (member 1) and reservation for Alice on Book 2
    const aliceLoan = spCheckoutBook(env.db, {
      memberId: 1,
      barcode: 'BC-101',
      librarianId: 2,
    });
    const fineInfo = env.db
      .prepare(
        "INSERT INTO fines (loan_id, member_id, amount, reason, status) VALUES (?, 1, 2.00, 'overdue', 'unpaid')"
      )
      .run(aliceLoan.loanId);
    const fineId = Number(fineInfo.lastInsertRowid);

    const resInfo = env.db
      .prepare("INSERT INTO reservations (book_id, member_id, status) VALUES (1, 1, 'waiting')")
      .run();
    const aliceResId = Number(resInfo.lastInsertRowid);

    const alice = await loginAs(srv.baseUrl, 'alice@library.local', 'Member123!');
    const bob = await loginAs(srv.baseUrl, 'bob@library.local', 'Member123!');
    const librarian = await loginAs(srv.baseUrl, 'librarian@library.local', 'Librarian123!');
    const admin = await loginAs(srv.baseUrl, 'admin@library.local', 'Admin123!');

    // Unauthenticated request -> 401
    const noAuth = await fetch(`${srv.baseUrl}/api/v1/me`);
    assert.equal(noAuth.status, 401);

    // Bob (member 2) cannot renew Alice's loan (member 1) -> 403
    const bobRenew = await fetch(`${srv.baseUrl}/api/v1/loans/${aliceLoan.loanId}/renew`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(bobRenew.status, 403);

    // Bob cannot cancel Alice's reservation -> 403
    const bobCancel = await fetch(`${srv.baseUrl}/api/v1/reservations/${aliceResId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(bobCancel.status, 403);

    // Members cannot access desk, member directory, reports, or admin endpoints -> 403
    for (const [method, url] of [
      ['GET', '/api/v1/members'],
      ['GET', '/api/v1/loans'],
      ['GET', '/api/v1/reports/overdue'],
      ['GET', '/api/v1/users'],
      ['GET', '/api/v1/audit-log'],
    ]) {
      const r = await fetch(`${srv.baseUrl}${url}`, {
        method,
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      });
      assert.equal(r.status, 403, `Expected 403 for member on ${method} ${url}`);
    }

    // Librarian CANNOT waive fines, manage users, or update loan policies -> 403
    const libWaive = await fetch(`${srv.baseUrl}/api/v1/fines/${fineId}/waive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${librarian.accessToken}` },
    });
    assert.equal(libWaive.status, 403);

    const libUsers = await fetch(`${srv.baseUrl}/api/v1/users`, {
      headers: { Authorization: `Bearer ${librarian.accessToken}` },
    });
    assert.equal(libUsers.status, 403);

    const libPolicy = await fetch(`${srv.baseUrl}/api/v1/loan-policies/student`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${librarian.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxLoans: 99,
        loanDays: 14,
        maxRenewals: 2,
        dailyFine: 0.5,
        maxUnpaidFines: 10,
      }),
    });
    assert.equal(libPolicy.status, 403);

    // Admin CAN waive fines
    const adminWaive = await fetch(`${srv.baseUrl}/api/v1/fines/${fineId}/waive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(adminWaive.status, 200);
    assert.equal((await adminWaive.json()).data.status, 'waived');
  } finally {
    await srv.close();
    env.cleanup();
  }
});
