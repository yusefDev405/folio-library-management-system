-- 003_views.sql
-- Rollback note: DROP VIEW IF EXISTS v_inventory_status, v_member_loan_summary, v_overdue_loans, v_book_availability;

CREATE VIEW IF NOT EXISTS v_book_availability AS
SELECT
  b.id AS book_id,
  b.isbn,
  b.title,
  COUNT(c.id) AS total_copies,
  COALESCE(SUM(CASE WHEN c.status = 'available' THEN 1 ELSE 0 END), 0) AS available_copies
FROM books b
LEFT JOIN book_copies c ON c.book_id = b.id
GROUP BY b.id, b.isbn, b.title;

CREATE VIEW IF NOT EXISTS v_overdue_loans AS
SELECT
  l.id AS loan_id,
  m.id AS member_id,
  m.member_number,
  m.first_name || ' ' || m.last_name AS member_name,
  b.id AS book_id,
  b.title,
  c.barcode,
  l.due_at,
  MAX(1, CAST(julianday('now') - julianday(l.due_at) AS INTEGER)) AS days_overdue
FROM loans l
JOIN members m ON m.id = l.member_id
JOIN book_copies c ON c.id = l.copy_id
JOIN books b ON b.id = c.book_id
WHERE l.returned_at IS NULL
  AND datetime(l.due_at) < datetime('now');

CREATE VIEW IF NOT EXISTS v_member_loan_summary AS
SELECT
  m.id AS member_id,
  m.member_number,
  m.first_name || ' ' || m.last_name AS member_name,
  m.member_type,
  m.status,
  COALESCE((
    SELECT COUNT(*) FROM loans l
    WHERE l.member_id = m.id AND l.returned_at IS NULL
  ), 0) AS active_loans,
  COALESCE((
    SELECT COUNT(*) FROM loans l
    WHERE l.member_id = m.id AND l.returned_at IS NULL AND datetime(l.due_at) < datetime('now')
  ), 0) AS overdue_loans,
  COALESCE((
    SELECT ROUND(SUM(f.amount), 2) FROM fines f
    WHERE f.member_id = m.id AND f.status = 'unpaid'
  ), 0) AS unpaid_fines
FROM members m;

CREATE VIEW IF NOT EXISTS v_inventory_status AS
SELECT
  cat.id AS category_id,
  cat.name AS category_name,
  c.status AS status,
  COUNT(c.id) AS copy_count
FROM book_copies c
JOIN books b ON b.id = c.book_id
LEFT JOIN categories cat ON cat.id = b.category_id
GROUP BY cat.id, cat.name, c.status;
