-- 006_indexes.sql
-- Rollback note: DROP INDEX IF EXISTS idx_audit_entity_created, idx_authors_name, idx_fines_member_status, idx_reservations_queue, idx_copies_book_status, idx_loans_returned_due, idx_loans_member_returned;

CREATE INDEX IF NOT EXISTS idx_loans_member_returned
  ON loans(member_id, returned_at);

CREATE INDEX IF NOT EXISTS idx_loans_returned_due
  ON loans(returned_at, due_at);

CREATE INDEX IF NOT EXISTS idx_copies_book_status
  ON book_copies(book_id, status);

CREATE INDEX IF NOT EXISTS idx_reservations_queue
  ON reservations(book_id, status, reserved_at);

CREATE INDEX IF NOT EXISTS idx_fines_member_status
  ON fines(member_id, status);

CREATE INDEX IF NOT EXISTS idx_authors_name
  ON authors(name);

CREATE INDEX IF NOT EXISTS idx_audit_entity_created
  ON audit_log(entity, created_at);
