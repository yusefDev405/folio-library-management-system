import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createTestEnv, loginAs, startTestServer } from './helpers.js';

test('REST API end-to-end flows, refresh rotation + reuse revocation, and error envelopes', async () => {
  const env = await createTestEnv();
  const app = createApp({ enableRateLimit: false });
  const srv = await startTestServer(app);

  try {
    // Health & Swagger docs
    const healthRes = await fetch(`${srv.baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    const docsRes = await fetch(`${srv.baseUrl}/api/docs/`);
    assert.equal(docsRes.status, 200);

    // Login & refresh rotation + reuse detection
    const aliceLogin = await loginAs(srv.baseUrl, 'alice@library.local', 'Member123!');
    assert.equal(aliceLogin.status, 200);
    assert.ok(aliceLogin.accessToken);

    const refreshRes = await fetch(`${srv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: aliceLogin.cookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(refreshRes.status, 200);
    const refreshJson = await refreshRes.json();
    const rotatedCookie = refreshRes.headers.get('set-cookie').split(';')[0];
    assert.notEqual(rotatedCookie, aliceLogin.cookie);

    // Reusing the OLD revoked refresh token must fail AND revoke the rotated token too
    const reuseRes = await fetch(`${srv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: aliceLogin.cookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(reuseRes.status, 401);
    const reuseJson = await reuseRes.json();
    assert.equal(reuseJson.error.code, 'REFRESH_TOKEN_REUSED');

    const afterRevokeRes = await fetch(`${srv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: rotatedCookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(afterRevokeRes.status, 401);

    // Public FTS catalogue search
    const searchRes = await fetch(`${srv.baseUrl}/api/v1/books?q=Designing&available=true`);
    assert.equal(searchRes.status, 200);
    const searchJson = await searchRes.json();
    assert.equal(searchJson.data.length, 1);
    assert.equal(searchJson.data[0].availableCopies, 2);

    // Validation error returns 400
    const lib = await loginAs(srv.baseUrl, 'librarian@library.local', 'Librarian123!');
    const badBookRes = await fetch(`${srv.baseUrl}/api/v1/books`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lib.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isbn: 'bad', title: '', authorIds: [] }),
    });
    assert.equal(badBookRes.status, 400);

    // Checkout both copies of Book 1, then Bob reserves Book 1
    for (const barcode of ['BC-101', 'BC-102']) {
      const co = await fetch(`${srv.baseUrl}/api/v1/loans/checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lib.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ memberId: 1, barcode }),
      });
      assert.equal(co.status, 201);
    }

    const bob = await loginAs(srv.baseUrl, 'bob@library.local', 'Member123!');
    const resCreate = await fetch(`${srv.baseUrl}/api/v1/reservations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bob.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: 1 }),
    });
    assert.equal(resCreate.status, 201);
    const resJson = await resCreate.json();
    assert.equal(resJson.data.queuePosition, 1);

    // Reports work for librarian
    const popularRes = await fetch(`${srv.baseUrl}/api/v1/reports/popular-books`, {
      headers: { Authorization: `Bearer ${lib.accessToken}` },
    });
    assert.equal(popularRes.status, 200);
    const popularJson = await popularRes.json();
    assert.ok(popularJson.data.length >= 1);
    assert.equal(popularJson.data[0].rankInCategory, 1);
  } finally {
    await srv.close();
    env.cleanup();
  }
});
