import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../backend/src/config/db.js';
import { env, ROOT_DIR } from '../backend/src/config/env.js';

const backupsDir = path.join(ROOT_DIR, 'data', 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);
const outFile = path.join(backupsDir, `library_${stamp}.db`);

// Remove existing same-day snapshot before VACUUM INTO
if (fs.existsSync(outFile)) {
  fs.rmSync(outFile, { force: true });
}

const db = getDb();
// VACUUM INTO creates a transactionally consistent, standalone compact copy of tables, views, triggers, indexes, and FTS5
const escapedPath = outFile.replace(/'/g, "''");
db.exec(`VACUUM INTO '${escapedPath}';`);
db.close();

// Retain only the latest N backups
const files = fs
  .readdirSync(backupsDir)
  .filter((f) => f.startsWith('library_') && f.endsWith('.db'))
  .sort()
  .reverse();

for (const oldFile of files.slice(env.backupRetention)) {
  fs.rmSync(path.join(backupsDir, oldFile), { force: true });
}

console.log(
  JSON.stringify({
    status: 'backup_created',
    file: outFile,
    sizeBytes: fs.statSync(outFile).size,
    retainedBackups: Math.min(files.length, env.backupRetention),
  })
);
