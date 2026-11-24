import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDb } from '../backend/src/config/db.js';
import { ROOT_DIR } from '../backend/src/config/env.js';

const backupsDir = path.join(ROOT_DIR, 'data', 'backups');
const argFile = process.argv[2];

let backupFile = argFile ? path.resolve(ROOT_DIR, argFile) : null;
if (!backupFile) {
  if (!fs.existsSync(backupsDir)) {
    throw new Error('No backups directory found. Run npm run backup first.');
  }
  const latest = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith('library_') && f.endsWith('.db'))
    .sort()
    .pop();
  if (!latest) throw new Error('No backup files found in data/backups.');
  backupFile = path.join(backupsDir, latest);
}

if (!fs.existsSync(backupFile)) {
  throw new Error(`Backup file does not exist: ${backupFile}`);
}

const scratchPath = path.join(ROOT_DIR, 'data', 'restore_verify_scratch.db');
fs.rmSync(scratchPath, { force: true });
fs.copyFileSync(backupFile, scratchPath);

const liveDb = getDb();
const restoredDb = new DatabaseSync(scratchPath);

const tables = [
  'users',
  'loan_policies',
  'members',
  'authors',
  'categories',
  'books',
  'book_authors',
  'book_copies',
  'loans',
  'reservations',
  'fines',
  'audit_log',
];

const comparison = [];
let mismatch = false;
for (const table of tables) {
  const liveCount = liveDb.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  const restoredCount = restoredDb.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  if (liveCount !== restoredCount) mismatch = true;
  comparison.push({ table, liveCount, restoredCount });
}

const liveTriggers = liveDb
  .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
  .all()
  .map((r) => r.name);
const restoredTriggers = restoredDb
  .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
  .all()
  .map((r) => r.name);

const liveViews = liveDb
  .prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")
  .all()
  .map((r) => r.name);
const restoredViews = restoredDb
  .prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")
  .all()
  .map((r) => r.name);

liveDb.close();
restoredDb.close();
fs.rmSync(scratchPath, { force: true });

if (
  mismatch ||
  JSON.stringify(liveTriggers) !== JSON.stringify(restoredTriggers) ||
  JSON.stringify(liveViews) !== JSON.stringify(restoredViews)
) {
  console.error('Restore verification failed:', { comparison, liveTriggers, restoredTriggers });
  process.exit(1);
}

console.log(
  JSON.stringify({
    status: 'restore_verified',
    backupFile,
    tablesVerified: comparison.length,
    triggersCount: restoredTriggers.length,
    viewsCount: restoredViews.length,
    rowCounts: comparison,
  })
);
