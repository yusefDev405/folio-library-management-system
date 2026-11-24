import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { spCheckoutBook, spGenerateReminders, spReportCopyIssue } from '../src/db/procedures.js';
import { createTestEnv, loginAs, startTestServer } from './helpers.js';

test('Reading list, book reviews, and notifications enforce ownership and reminder idempotency', async () => {
  const env = await createTestEnv();
  const app = createApp({ enableRateLimit: false });
  const srv = await startTestServer(app);

  try {
    const alice = await loginAs(srv.baseUrl, 'alice@library.local', 'Member123!');
    const bob = await loginAs(srv.baseUrl, 'bob@library.local', 'Member123!');

    // Reading list upsert & fetch
    const rlAdd = await fetch(`${srv.baseUrl}/api/v1/me/reading-list`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${alice.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: 1, shelf: 'reading', notes: 'Chapter 3' }),
    });
    assert.equal(rlAdd.status, 201);

    const bobRl = await fetch(`${srv.baseUrl}/api/v1/me/reading-list`, {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal((await bobRl.json()).data.length, 0);

    // Book reviews upsert & average
    const rev1 = await fetch(`${srv.baseUrl}/api/v1/books/1/reviews`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${alice.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rating: 5, comment: 'Great systems reference' }),
    });
    assert.equal(rev1.status, 201);
    const rev1Json = await rev1.json();

    const rev2 = await fetch(`${srv.baseUrl}/api/v1/books/1/reviews`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bob.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rating: 3, comment: 'Dense but thorough' }),
    });
    assert.equal(rev2.status, 201);

    const revList = await (await fetch(`${srv.baseUrl}/api/v1/books/1/reviews`)).json();
    assert.equal(revList.data.reviewCount, 2);
    assert.equal(revList.data.averageRating, 4);

    // Bob cannot delete Alice's review
    const badDel = await fetch(`${srv.baseUrl}/api/v1/reviews/${rev1Json.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(badDel.status, 403);

    // Due-soon / overdue reminder generation is idempotent
    spCheckoutBook(env.db, {
      memberId: 1,
      barcode: 'BC-101',
      librarianId: 2,
      now: '2026-11-01T10:00:00Z',
    });
    const r1 = spGenerateReminders(env.db, { now: '2026-11-13T10:00:00Z' });
    const r2 = spGenerateReminders(env.db, { now: '2026-11-13T10:00:00Z' });
    assert.equal(r1.created, 1);
    assert.equal(r2.created, 0);

    const notifRes = await (
      await fetch(`${srv.baseUrl}/api/v1/me/notifications`, {
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      })
    ).json();
    assert.equal(notifRes.meta.unreadCount, 1);

    // Bob cannot mark Alice's notification read
    const bobRead = await fetch(
      `${srv.baseUrl}/api/v1/me/notifications/${notifRes.data[0].id}/read`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${bob.accessToken}` } }
    );
    assert.equal(bobRead.status, 403);

    // Alice marks all read
    const readAll = await fetch(`${srv.baseUrl}/api/v1/me/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    assert.equal(readAll.status, 200);
  } finally {
    await srv.close();
    env.cleanup();
  }
});

test('Stocktake, CSV import, copy issue settlement, analytics, quick search, and backup verify work end-to-end', async () => {
  const env = await createTestEnv();
  const app = createApp({ enableRateLimit: false });
  const srv = await startTestServer(app);

  try {
    const librarian = await loginAs(srv.baseUrl, 'librarian@library.local', 'Librarian123!');
    const admin = await loginAs(srv.baseUrl, 'admin@library.local', 'Admin123!');

    // 1. Report lost copy while checked out -> closes loan, creates fine, notifies member
    spCheckoutBook(env.db, { memberId: 1, barcode: 'BC-101', librarianId: 2 });
    const issueRes = await fetch(`${srv.baseUrl}/api/v1/copies/1/report-issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${librarian.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'lost', fineAmount: 22.5 }),
    });
    assert.equal(issueRes.status, 200);
    const issueJson = await issueRes.json();
    assert.equal(issueJson.data.copy.status, 'lost');
    assert.equal(issueJson.data.fineAmount, 22.5);
    assert.ok(issueJson.data.closedLoanId > 0);

    // Copy history returns the closed loan
    const histRes = await (
      await fetch(`${srv.baseUrl}/api/v1/copies/1/history`, {
        headers: { Authorization: `Bearer ${librarian.accessToken}` },
      })
    ).json();
    assert.equal(histRes.data.loans.length, 1);

    // 2. Bulk CSV import (preview then commit)
    const csvSample = [
      'isbn,title,author,category,publisher,published_year,description',
      '9780134685991,Effective Java,Joshua Bloch,Software Engineering,Addison-Wesley,2018,Java guide',
      'BAD-ISBN,Broken Row,Nobody,Software Engineering,Press,2020,Invalid',
    ].join('\n');

    const dryRes = await (
      await fetch(`${srv.baseUrl}/api/v1/books/import-csv`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${librarian.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvText: csvSample, dryRun: true }),
      })
    ).json();
    assert.equal(dryRes.data.validCount, 1);
    assert.equal(dryRes.data.rejectedCount, 1);

    const commitRes = await (
      await fetch(`${srv.baseUrl}/api/v1/books/import-csv`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${librarian.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvText: csvSample, dryRun: false }),
      })
    ).json();
    assert.equal(commitRes.data.imported, 1);

    // 3. Stocktake session lifecycle
    const stCreate = await (
      await fetch(`${srv.baseUrl}/api/v1/stocktakes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${librarian.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Database Shelf Audit', categoryId: 1 }),
      })
    ).json();
    const stId = stCreate.data.session.id;
    // Only BC-102 is expected (BC-101 is lost)
    assert.equal(stCreate.data.summary.expectedCount, 1);

    const scanOk = await (
      await fetch(`${srv.baseUrl}/api/v1/stocktakes/${stId}/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${librarian.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ barcode: 'BC-102', scannedShelf: 'DB-01' }),
      })
    ).json();
    assert.equal(scanOk.data.classification, 'verified');

    const scanUnexpected = await (
      await fetch(`${srv.baseUrl}/api/v1/stocktakes/${stId}/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${librarian.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ barcode: 'BC-201', scannedShelf: 'DB-01' }),
      })
    ).json();
    assert.equal(scanUnexpected.data.classification, 'unexpected');

    const stClosed = await (
      await fetch(`${srv.baseUrl}/api/v1/stocktakes/${stId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${librarian.accessToken}` },
      })
    ).json();
    assert.equal(stClosed.data.session.status, 'closed');
    assert.equal(stClosed.data.summary.missingCount, 0);
    assert.equal(stClosed.data.summary.verifiedCount, 1);

    // 4. Analytics & Quick Search & Holds Queue
    const analytics = await (
      await fetch(`${srv.baseUrl}/api/v1/reports/analytics`, {
        headers: { Authorization: `Bearer ${librarian.accessToken}` },
      })
    ).json();
    assert.ok(analytics.data.kpis.totalBooks >= 3);

    const quick = await (
      await fetch(`${srv.baseUrl}/api/v1/search/quick?q=BC-102`, {
        headers: { Authorization: `Bearer ${librarian.accessToken}` },
      })
    ).json();
    assert.equal(quick.data.copies.length, 1);

    const holds = await (
      await fetch(`${srv.baseUrl}/api/v1/reservations`, {
        headers: { Authorization: `Bearer ${librarian.accessToken}` },
      })
    ).json();
    assert.ok(Array.isArray(holds.data));

    // 5. Admin Backup Create & Verify
    const snapRes = await fetch(`${srv.baseUrl}/api/v1/admin/backups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(snapRes.status, 201);
    const snapJson = await snapRes.json();

    const verifyRes = await (
      await fetch(`${srv.baseUrl}/api/v1/admin/backups/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${admin.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: snapJson.data.filename }),
      })
    ).json();
    assert.equal(verifyRes.data.ok, true);
    assert.equal(verifyRes.data.tablesVerified, 12);
  } finally {
    await srv.close();
    env.cleanup();
  }
});
