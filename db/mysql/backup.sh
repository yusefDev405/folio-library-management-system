#!/usr/bin/env bash
set -euo pipefail

# MySQL 8 reference backup script (includes routines, triggers, and scheduled events)
mkdir -p backups
OUT="backups/library_$(date +%F).sql"
mysqldump --single-transaction --routines --triggers --events \
  -h "${DB_HOST:-127.0.0.1}" -u "${DB_USER:-root}" -p "${DB_NAME:-library}" > "$OUT"

# Keep last 5 dumps
ls -1t backups/library_*.sql | tail -n +6 | xargs -r rm -f
echo "Backup written to $OUT"
