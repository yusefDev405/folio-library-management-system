import { performance } from 'node:perf_hooks';
import { openDatabase, runMigrations } from '../backend/src/config/db.js';

// Runs entirely in :memory: SQLite so 0 bytes are persisted to disk.
const db = openDatabase(':memory:');
runMigrations(db);

db.exec('BEGIN;');
db.exec("INSERT INTO categories (id, name) VALUES (1, 'Science'), (2, 'Engineering'), (3, 'History');");
db.exec("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'bench@local', 'x', 'member');");
db.exec("INSERT INTO members (id, user_id, member_number, first_name, last_name, member_type, status, expires_at) VALUES (1, 1, 'B-1', 'Bench', 'User', 'student', 'active', '2030-01-01');");

const insertBook = db.prepare(
  'INSERT INTO books (isbn, title, published_year, category_id, description) VALUES (?, ?, ?, ?, ?)'
);
const insertCopy = db.prepare(
  "INSERT INTO book_copies (book_id, barcode, shelf_location, status) VALUES (?, ?, 'A-01', 'available')"
);
const insertLoan = db.prepare(
  'INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, returned_at) VALUES (?, 1, ?, ?, ?)'
);

const BOOK_COUNT = 2500;
const LOAN_COUNT = 8000;

for (let i = 1; i <= BOOK_COUNT; i += 1) {
  const isbn = String(9780000000000 + i);
  const title =
    i % 50 === 0
      ? `Distributed Storage Engine Volume ${i}`
      : `Archival Monograph Series Number ${i}`;
  const desc =
    i % 50 === 0
      ? 'Comprehensive study of transactions, indexing, and consensus protocols.'
      : 'General reference collection volume.';
  const bInfo = insertBook.run(isbn, title, 2000 + (i % 25), (i % 3) + 1, desc);
  insertCopy.run(Number(bInfo.lastInsertRowid), `BC-${i}`);
}

for (let i = 1; i <= LOAN_COUNT; i += 1) {
  const copyId = ((i - 1) % BOOK_COUNT) + 1;
  const isOpenOverdue = i <= 40;
  const checkedOut = '2026-01-01T10:00:00Z';
  const dueAt = isOpenOverdue ? '2026-01-15T10:00:00Z' : '2026-01-20T10:00:00Z';
  const returnedAt = isOpenOverdue ? null : '2026-01-18T10:00:00Z';
  insertLoan.run(copyId, checkedOut, dueAt, returnedAt);
}
db.exec('COMMIT;');

// 1. Compare LIKE '%Distributed%' vs FTS5 MATCH '"Distributed"*'
const likeSql = "SELECT id, title FROM books WHERE title LIKE '%Distributed%' OR description LIKE '%Distributed%'";
const ftsSql = `SELECT b.id, b.title FROM books b JOIN books_fts f ON f.rowid = b.id WHERE books_fts MATCH '"Distributed"*'`;

const likePlan = db.prepare(`EXPLAIN QUERY PLAN ${likeSql}`).all();
const ftsPlan = db.prepare(`EXPLAIN QUERY PLAN ${ftsSql}`).all();

const t0 = performance.now();
for (let r = 0; r < 25; r += 1) db.prepare(likeSql).all();
const likeMs = (performance.now() - t0) / 25;

const t1 = performance.now();
for (let r = 0; r < 25; r += 1) db.prepare(ftsSql).all();
const ftsMs = (performance.now() - t1) / 25;

// 2. Compare Overdue Report WITHOUT vs WITH idx_loans_returned_due
const overdueSql =
  "SELECT l.id, l.due_at FROM loans l WHERE l.returned_at IS NULL AND l.due_at < '2026-11-24T00:00:00Z'";

const withIdxPlan = db.prepare(`EXPLAIN QUERY PLAN ${overdueSql}`).all();
const t2 = performance.now();
for (let r = 0; r < 50; r += 1) db.prepare(overdueSql).all();
const withIdxMs = (performance.now() - t2) / 50;

db.exec('DROP INDEX IF EXISTS idx_loans_returned_due;');
const withoutIdxPlan = db.prepare(`EXPLAIN QUERY PLAN ${overdueSql}`).all();
const t3 = performance.now();
for (let r = 0; r < 50; r += 1) db.prepare(overdueSql).all();
const withoutIdxMs = (performance.now() - t3) / 50;

db.close();

console.log(
  JSON.stringify(
    {
      dataset: { books: BOOK_COUNT, loans: LOAN_COUNT, storage: ':memory: (0 bytes on disk)' },
      search: {
        likeAvgMs: Number(likeMs.toFixed(3)),
        fts5AvgMs: Number(ftsMs.toFixed(3)),
        likePlan,
        ftsPlan,
      },
      overdue: {
        withoutIndexAvgMs: Number(withoutIdxMs.toFixed(3)),
        withCompositeIndexAvgMs: Number(withIdxMs.toFixed(3)),
        withoutIdxPlan,
        withIdxPlan,
      },
    },
    null,
    2
  )
);
