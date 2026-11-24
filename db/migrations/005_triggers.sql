-- 005_triggers.sql
-- Rollback note: DROP TRIGGER IF EXISTS trg_reservations_audit_update, trg_reservations_audit_insert, trg_fines_audit_update, trg_fines_audit_insert, trg_loans_audit_update, trg_loans_audit_insert;

CREATE TRIGGER IF NOT EXISTS trg_loans_audit_insert AFTER INSERT ON loans
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    COALESCE((SELECT actor_user_id FROM app_context WHERE id = 1), NEW.checked_out_by),
    'INSERT',
    'loans',
    NEW.id,
    NULL,
    json_object(
      'copy_id', NEW.copy_id,
      'member_id', NEW.member_id,
      'checked_out_at', NEW.checked_out_at,
      'due_at', NEW.due_at,
      'renewals_count', NEW.renewals_count
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_loans_audit_update AFTER UPDATE ON loans
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    (SELECT actor_user_id FROM app_context WHERE id = 1),
    'UPDATE',
    'loans',
    NEW.id,
    json_object(
      'returned_at', OLD.returned_at,
      'due_at', OLD.due_at,
      'renewals_count', OLD.renewals_count
    ),
    json_object(
      'returned_at', NEW.returned_at,
      'due_at', NEW.due_at,
      'renewals_count', NEW.renewals_count
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_fines_audit_insert AFTER INSERT ON fines
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    (SELECT actor_user_id FROM app_context WHERE id = 1),
    'INSERT',
    'fines',
    NEW.id,
    NULL,
    json_object(
      'loan_id', NEW.loan_id,
      'member_id', NEW.member_id,
      'amount', NEW.amount,
      'reason', NEW.reason,
      'status', NEW.status
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_fines_audit_update AFTER UPDATE ON fines
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    (SELECT actor_user_id FROM app_context WHERE id = 1),
    'UPDATE',
    'fines',
    NEW.id,
    json_object('status', OLD.status, 'paid_at', OLD.paid_at),
    json_object('status', NEW.status, 'paid_at', NEW.paid_at)
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_reservations_audit_insert AFTER INSERT ON reservations
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    (SELECT actor_user_id FROM app_context WHERE id = 1),
    'INSERT',
    'reservations',
    NEW.id,
    NULL,
    json_object(
      'book_id', NEW.book_id,
      'member_id', NEW.member_id,
      'status', NEW.status
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_reservations_audit_update AFTER UPDATE ON reservations
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    (SELECT actor_user_id FROM app_context WHERE id = 1),
    'UPDATE',
    'reservations',
    NEW.id,
    json_object('status', OLD.status, 'ready_at', OLD.ready_at, 'expires_at', OLD.expires_at),
    json_object('status', NEW.status, 'ready_at', NEW.ready_at, 'expires_at', NEW.expires_at)
  );
END;
