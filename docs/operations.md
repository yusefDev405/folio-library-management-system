# Operations, Migrations, Backup & Recovery

## Environment Variables
Copy `.env.example` to `.env` for custom local settings:
- `NODE_ENV`: `development` | `production` | `test`
- `PORT`: HTTP port (default `3000`)
- `DB_PATH`: SQLite file path (default `./data/library.db`)
- `JWT_SECRET`: Secret key (minimum 32 characters; required in production)
- `JWT_EXPIRES_IN`: Access token TTL (default `15m`)
- `REFRESH_TOKEN_DAYS`: Refresh cookie lifetime in days (default `7`)
- `CORS_ORIGIN`: Allowed origin (default `http://localhost:3000`)
- `BACKUP_RETENTION`: Number of recent DB snapshots kept (default `5`)
- `HOLD_EXPIRY_INTERVAL_MS`: Interval for background `spExpireHolds` job (default `3600000` / 1 hour)

## Migrations & Seed Data
- Forward-only numbered SQL files in `db/migrations/` (`001_schema.sql` through `006_indexes.sql`), tracked in `schema_migrations`.
- Run migrations: `npm run migrate`
- Seed small demo dataset (< 200 KB): `npm run seed` (or `npm run seed -- --reset`)
- Bonus CSV legacy import (validates ISBN-10/ISBN-13 checksums, writes bad rows to `*-errors.csv`): `npm run import:csv`

## Backup & Restore Verification
- **Create backup**: `npm run backup` uses SQLite's `VACUUM INTO 'data/backups/library_YYYY-MM-DD.db'` to produce a transactionally consistent, compact snapshot containing all tables, views, triggers, FTS5 indexes, and constraints, while keeping only the latest `BACKUP_RETENTION` snapshots.
- **Verify restore**: `npm run restore` copies the latest backup into a scratch database, compares row counts across all 12 tables plus the full list of views and triggers against the live database, and cleans up the scratch file immediately.
- **MySQL 8 reference**: See `db/mysql/backup.sh` (`mysqldump --single-transaction --routines --triggers --events`) and `db/mysql/restore.sh`. Note that forgetting `--routines --triggers --events` in `mysqldump` omits stored procedures, audit triggers, and `ev_expire_holds`.
- **Production point-in-time recovery (PITR)**: In a multi-node MySQL deployment, enable binary logging (`log_bin`) alongside periodic full snapshots so transactions between backups can be replayed up to any second (`mysqlbinlog`).

## Hold-Expiry Scheduler
- At server startup and once per hour (`HOLD_EXPIRY_INTERVAL_MS`), `backend/src/server.js` runs `spExpireHolds` (`backend/src/db/procedures.js`) to expire `ready` holds past `expires_at` and promote the next waiting reservation (or release the copy back to `available`).
- Administrators can also trigger it on demand via `POST /api/v1/admin/expire-holds` or the Admin Console.
