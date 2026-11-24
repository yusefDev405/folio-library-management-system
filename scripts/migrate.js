import { getDb, runMigrations } from '../backend/src/config/db.js';
import { env } from '../backend/src/config/env.js';

const db = getDb();
const applied = runMigrations(db);
console.log(
  JSON.stringify({
    dbPath: env.dbPath,
    newlyApplied: applied,
    status: 'ok',
  })
);
db.close();
