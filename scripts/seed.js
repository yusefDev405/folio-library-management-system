import fs from 'node:fs';
import path from 'node:path';
import { getDb, runMigrations, setActorContext } from '../backend/src/config/db.js';
import { env, ROOT_DIR } from '../backend/src/config/env.js';
import { hashPassword } from '../backend/src/utils/password.js';

const reset = process.argv.includes('--reset');

if (reset && fs.existsSync(env.dbPath)) {
  fs.rmSync(env.dbPath, { force: true });
  fs.rmSync(`${env.dbPath}-wal`, { force: true });
  fs.rmSync(`${env.dbPath}-shm`, { force: true });
}

const db = getDb();
runMigrations(db);

const existingUsers = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
if (existingUsers > 0 && !reset) {
  console.log('Database already seeded. Pass --reset to recreate with fresh tiny seed data.');
  db.close();
  process.exit(0);
}

const [adminHash, librarianHash, memberHash] = await Promise.all([
  hashPassword('Admin123!'),
  hashPassword('Librarian123!'),
  hashPassword('Member123!'),
]);

const seedSql = fs
  .readFileSync(path.join(ROOT_DIR, 'db', 'seeds', 'seed_small.sql'), 'utf8')
  .replaceAll('__ADMIN_HASH__', adminHash)
  .replaceAll('__LIBRARIAN_HASH__', librarianHash)
  .replaceAll('__MEMBER_HASH__', memberHash);

db.exec('BEGIN IMMEDIATE;');
try {
  setActorContext(db, 1);
  db.exec(seedSql);
  setActorContext(db, null);
  db.exec('COMMIT;');
} catch (err) {
  try {
    db.exec('ROLLBACK;');
  } catch {
    // ignore
  }
  throw err;
}

const stats = {
  books: db.prepare('SELECT COUNT(*) AS c FROM books').get().c,
  copies: db.prepare('SELECT COUNT(*) AS c FROM book_copies').get().c,
  users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
  members: db.prepare('SELECT COUNT(*) AS c FROM members').get().c,
  loans: db.prepare('SELECT COUNT(*) AS c FROM loans').get().c,
  reservations: db.prepare('SELECT COUNT(*) AS c FROM reservations').get().c,
  fines: db.prepare('SELECT COUNT(*) AS c FROM fines').get().c,
};
db.close();

const sizeBytes = fs.existsSync(env.dbPath) ? fs.statSync(env.dbPath).size : 0;
console.log(JSON.stringify({ status: 'seeded', sizeBytes, stats }));
