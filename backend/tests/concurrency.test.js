import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createTestEnv, loginAs, startTestServer } from './helpers.js';

test('20 parallel checkouts of one barcode produce exactly 1 success and 19 conflicts', async () => {
  const env = await createTestEnv();
  const app = createApp({ enableRateLimit: false });
  const srv = await startTestServer(app);

  try {
    const librarian = await loginAs(srv.baseUrl, 'librarian@library.local', 'Librarian123!');

    const requests = Array.from({ length: 20 }, (_, i) =>
      fetch(`${srv.baseUrl}/api/v1/loans/checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${librarian.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId: i % 2 === 0 ? 1 : 2,
          barcode: 'BC-101',
        }),
      })
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 201).length;
    const conflicts = statuses.filter((s) => s === 409).length;

    assert.equal(successes, 1);
    assert.equal(conflicts, 19);

    const openLoans = env.db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM loans l
         JOIN book_copies c ON c.id = l.copy_id
         WHERE c.barcode = 'BC-101' AND l.returned_at IS NULL`
      )
      .get().cnt;
    assert.equal(openLoans, 1);
  } finally {
    await srv.close();
    env.cleanup();
  }
});
