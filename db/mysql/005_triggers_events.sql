-- MySQL 8.0 Reference: Triggers and Scheduled Hold-Expiry Event
DELIMITER $$

CREATE TRIGGER trg_loans_audit AFTER UPDATE ON loans FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    @app_user_id,
    'UPDATE',
    'loans',
    NEW.id,
    JSON_OBJECT('returned_at', OLD.returned_at, 'due_at', OLD.due_at, 'renewals', OLD.renewals_count),
    JSON_OBJECT('returned_at', NEW.returned_at, 'due_at', NEW.due_at, 'renewals', NEW.renewals_count)
  );
END$$

CREATE TRIGGER trg_fines_audit AFTER UPDATE ON fines FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    @app_user_id,
    'UPDATE',
    'fines',
    NEW.id,
    JSON_OBJECT('status', OLD.status, 'paid_at', OLD.paid_at),
    JSON_OBJECT('status', NEW.status, 'paid_at', NEW.paid_at)
  );
END$$

CREATE EVENT ev_expire_holds
ON SCHEDULE EVERY 1 HOUR
DO CALL sp_expire_holds()$$

DELIMITER ;
