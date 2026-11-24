import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, runMigrations, setActorContext, setDbForTesting } from '../src/config/db.js';
import { hashPassword } from '../src/utils/password.js';

export async function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = openDatabase(dbPath);
  runMigrations(db);
  setDbForTesting(db);

  const [adminHash, librarianHash, memberHash] = await Promise.all([
    hashPassword('Admin123!'),
    hashPassword('Librarian123!'),
    hashPassword('Member123!'),
  ]);

  setActorContext(db, 1);
  db.exec(`
    INSERT INTO users (id, email, password_hash, role, is_active) VALUES
      (1, 'admin@library.local', '${adminHash}', 'admin', 1),
      (2, 'librarian@library.local', '${librarianHash}', 'librarian', 1),
      (3, 'alice@library.local', '${memberHash}', 'member', 1),
      (4, 'bob@library.local', '${memberHash}', 'member', 1),
      (5, 'expired@library.local', '${memberHash}', 'member', 1),
      (6, 'suspended@library.local', '${memberHash}', 'member', 1);

    INSERT INTO members (id, user_id, member_number, first_name, last_name, member_type, status, expires_at) VALUES
      (1, 3, 'M-001', 'Alice', 'Reader', 'student', 'active', '2030-12-31'),
      (2, 4, 'M-002', 'Bob', 'Scholar', 'external', 'active', '2030-12-31'),
      (3, 5, 'M-003', 'Eve', 'Expired', 'student', 'active', '2020-01-01'),
      (4, 6, 'M-004', 'Sam', 'Suspended', 'student', 'suspended', '2030-12-31');

    INSERT INTO categories (id, name) VALUES (1, 'Database Systems'), (2, 'Algorithms');
    INSERT INTO authors (id, name) VALUES (1, 'Martin Kleppmann'), (2, 'Donald Knuth');

    INSERT INTO books (id, isbn, title, publisher, published_year, category_id, description) VALUES
      (1, '9781449373320', 'Designing Data-Intensive Applications', 'O''Reilly', 2017, 1, 'Distributed systems storage'),
      (2, '9780201896831', 'The Art of Computer Programming', 'Addison-Wesley', 1997, 2, 'Fundamental algorithms');

    INSERT INTO book_authors (book_id, author_id) VALUES (1, 1), (2, 2);

    INSERT INTO book_copies (id, book_id, barcode, shelf_location, status) VALUES
      (1, 1, 'BC-101', 'DB-01', 'available'),
      (2, 1, 'BC-102', 'DB-01', 'available'),
      (3, 2, 'BC-201', 'AL-01', 'available'),
      (4, 2, 'BC-202', 'AL-01', 'damaged');
  `);
  setActorContext(db, null);

  return {
    db,
    dbPath,
    cleanup() {
      try {
        db.close();
      } catch {
        // ignore
      }
      setDbForTesting(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function loginAs(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  return {
    status: res.status,
    accessToken: json.data?.accessToken,
    user: json.data?.user,
    cookie,
  };
}
