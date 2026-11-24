import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env, ROOT_DIR } from './env.js';

export function openDatabase(dbPath = env.dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  return db;
}

export function runMigrations(db, migrationsDir = path.join(ROOT_DIR, 'db', 'migrations')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM schema_migrations').all().map((r) => r.filename)
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedNow = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('BEGIN;');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
      db.exec('COMMIT;');
      appliedNow.push(file);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
  return appliedNow;
}

export function setActorContext(db, actorUserId) {
  db.prepare('INSERT OR REPLACE INTO app_context (id, actor_user_id) VALUES (1, ?)').run(
    actorUserId ?? null
  );
}

export function withTransaction(db, actorUserId, fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    setActorContext(db, actorUserId);
    const result = fn();
    setActorContext(db, null);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      setActorContext(db, null);
    } catch {
      // ignore cleanup failure before rollback
    }
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore if already rolled back
    }
    throw err;
  }
}

let sharedDb = null;
export function getDb() {
  if (!sharedDb) {
    sharedDb = openDatabase(env.dbPath);
  }
  return sharedDb;
}

export function setDbForTesting(db) {
  sharedDb = db;
}
