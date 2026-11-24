-- 007_enhancements.sql
-- Rollback note: DROP TABLE IF EXISTS stocktake_scans, stocktake_sessions, notifications, book_reviews, reading_list;

CREATE TABLE IF NOT EXISTS reading_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  shelf TEXT NOT NULL DEFAULT 'want_to_read' CHECK (shelf IN ('want_to_read', 'reading', 'finished')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (member_id, book_id)
);

CREATE TABLE IF NOT EXISTS book_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (book_id, member_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('due_soon', 'overdue', 'hold_ready', 'fine_assessed', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS stocktake_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  shelf_prefix TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  started_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS stocktake_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL COLLATE NOCASE,
  copy_id INTEGER REFERENCES book_copies(id) ON DELETE SET NULL,
  scanned_shelf TEXT NOT NULL DEFAULT '',
  scanned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  scanned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (session_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, read_at, created_at);

CREATE INDEX IF NOT EXISTS idx_reviews_book
  ON book_reviews(book_id);

CREATE INDEX IF NOT EXISTS idx_reading_list_member
  ON reading_list(member_id, shelf);
