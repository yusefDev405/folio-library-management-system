-- 001_schema.sql
-- Rollback note: DROP TABLE IF EXISTS audit_log, refresh_tokens, fines, reservations, loans, book_copies, book_authors, books, categories, authors, members, loan_policies, users, app_context;

-- Session-scoped actor context so SQLite triggers record the authenticated actor_user_id
CREATE TABLE IF NOT EXISTS app_context (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  actor_user_id INTEGER
);
INSERT OR IGNORE INTO app_context (id, actor_user_id) VALUES (1, NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member', 'librarian', 'admin')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS loan_policies (
  member_type TEXT PRIMARY KEY CHECK (member_type IN ('student', 'staff', 'external')),
  max_loans INTEGER NOT NULL CHECK (max_loans >= 0),
  loan_days INTEGER NOT NULL CHECK (loan_days > 0),
  max_renewals INTEGER NOT NULL CHECK (max_renewals >= 0),
  daily_fine NUMERIC NOT NULL CHECK (daily_fine >= 0),
  max_unpaid_fines NUMERIC NOT NULL CHECK (max_unpaid_fines >= 0),
  hold_days INTEGER NOT NULL DEFAULT 3 CHECK (hold_days > 0)
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  member_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  member_type TEXT NOT NULL REFERENCES loan_policies(member_type) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL COLLATE NOCASE,
  publisher TEXT,
  published_year INTEGER CHECK (published_year IS NULL OR (published_year >= 1400 AND published_year <= 2100)),
  category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS book_authors (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  PRIMARY KEY (book_id, author_id)
);

CREATE TABLE IF NOT EXISTS book_copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  barcode TEXT NOT NULL UNIQUE COLLATE NOCASE,
  shelf_location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_loan', 'reserved', 'lost', 'damaged')),
  acquired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_id INTEGER NOT NULL REFERENCES book_copies(id) ON DELETE RESTRICT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  checked_out_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  due_at TEXT NOT NULL,
  returned_at TEXT,
  renewals_count INTEGER NOT NULL DEFAULT 0 CHECK (renewals_count >= 0),
  checked_out_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  active_copy_id INTEGER GENERATED ALWAYS AS (
    CASE WHEN returned_at IS NULL THEN copy_id ELSE NULL END
  ) STORED,
  CHECK (datetime(due_at) > datetime(checked_out_at))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_one_active_per_copy
  ON loans(active_copy_id);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  reserved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'fulfilled', 'cancelled', 'expired')),
  ready_at TEXT,
  expires_at TEXT,
  active_member_book TEXT GENERATED ALWAYS AS (
    CASE WHEN status IN ('waiting', 'ready') THEN (member_id || ':' || book_id) ELSE NULL END
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_one_open
  ON reservations(active_member_book);

CREATE TABLE IF NOT EXISTS fines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (reason IN ('overdue', 'lost', 'damaged')),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'waived')),
  assessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  old_data TEXT,
  new_data TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
