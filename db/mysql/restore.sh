#!/usr/bin/env bash
set -euo pipefail

# MySQL 8 reference restore verification script
BACKUP_FILE="${1:?Usage: restore.sh <backups/library_YYYY-MM-DD.sql>}"
TARGET_DB="library_restore_verify"

mysql -h "${DB_HOST:-127.0.0.1}" -u "${DB_USER:-root}" -p -e "DROP DATABASE IF EXISTS ${TARGET_DB}; CREATE DATABASE ${TARGET_DB};"
mysql -h "${DB_HOST:-127.0.0.1}" -u "${DB_USER:-root}" -p "${TARGET_DB}" < "$BACKUP_FILE"

mysql -h "${DB_HOST:-127.0.0.1}" -u "${DB_USER:-root}" -p -e "
  SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = '${TARGET_DB}';
  SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${TARGET_DB}';
"
