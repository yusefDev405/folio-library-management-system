-- MySQL 8.0 Reference Schema (InnoDB, utf8mb4)
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('member', 'librarian', 'admin') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loan_policies (
  member_type ENUM('student', 'staff', 'external') PRIMARY KEY,
  max_loans INT NOT NULL CHECK (max_loans >= 0),
  loan_days INT NOT NULL CHECK (loan_days > 0),
  max_renewals INT NOT NULL CHECK (max_renewals >= 0),
  daily_fine DECIMAL(6,2) NOT NULL CHECK (daily_fine >= 0),
  max_unpaid_fines DECIMAL(8,2) NOT NULL CHECK (max_unpaid_fines >= 0),
  hold_days INT NOT NULL DEFAULT 3 CHECK (hold_days > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE members (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  member_number VARCHAR(32) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NULL,
  member_type ENUM('student', 'staff', 'external') NOT NULL,
  status ENUM('active', 'suspended', 'expired') NOT NULL DEFAULT 'active',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATE NOT NULL,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_members_policy FOREIGN KEY (member_type) REFERENCES loan_policies(member_type) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE authors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  INDEX idx_authors_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  parent_id BIGINT UNSIGNED NULL,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE books (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  isbn VARCHAR(13) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  publisher VARCHAR(160) NULL,
  published_year SMALLINT NULL,
  category_id BIGINT UNSIGNED NULL,
  description TEXT NULL,
  FULLTEXT KEY ft_books_title_desc (title, description),
  CONSTRAINT fk_books_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE book_authors (
  book_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (book_id, author_id),
  CONSTRAINT fk_ba_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ba_author FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE book_copies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  book_id BIGINT UNSIGNED NOT NULL,
  barcode VARCHAR(32) NOT NULL UNIQUE,
  shelf_location VARCHAR(64) NOT NULL,
  status ENUM('available', 'on_loan', 'reserved', 'lost', 'damaged') NOT NULL DEFAULT 'available',
  acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_copies_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  copy_id BIGINT UNSIGNED NOT NULL,
  member_id BIGINT UNSIGNED NOT NULL,
  checked_out_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME NOT NULL,
  returned_at DATETIME NULL,
  renewals_count INT NOT NULL DEFAULT 0 CHECK (renewals_count >= 0),
  checked_out_by BIGINT UNSIGNED NULL,
  active_copy_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(returned_at IS NULL, copy_id, NULL)) STORED,
  UNIQUE KEY uq_loans_one_active_per_copy (active_copy_id),
  CHECK (due_at > checked_out_at),
  CONSTRAINT fk_loans_copy FOREIGN KEY (copy_id) REFERENCES book_copies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_staff FOREIGN KEY (checked_out_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  book_id BIGINT UNSIGNED NOT NULL,
  member_id BIGINT UNSIGNED NOT NULL,
  reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('waiting', 'ready', 'fulfilled', 'cancelled', 'expired') NOT NULL DEFAULT 'waiting',
  ready_at DATETIME NULL,
  expires_at DATETIME NULL,
  active_member_book VARCHAR(64) GENERATED ALWAYS AS (
    IF(status IN ('waiting', 'ready'), CONCAT(member_id, ':', book_id), NULL)
  ) STORED,
  UNIQUE KEY uq_reservations_one_open (active_member_book),
  CONSTRAINT fk_res_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT,
  CONSTRAINT fk_res_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  loan_id BIGINT UNSIGNED NOT NULL,
  member_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(8,2) NOT NULL CHECK (amount > 0),
  reason ENUM('overdue', 'lost', 'damaged') NOT NULL,
  status ENUM('unpaid', 'paid', 'waived') NOT NULL DEFAULT 'unpaid',
  assessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  CONSTRAINT fk_fines_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fines_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(16) NOT NULL,
  entity VARCHAR(32) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
