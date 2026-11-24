-- MySQL 8.0 Reference: Procedures (sp_checkout_book, sp_return_book, sp_renew_loan, sp_expire_holds)
DELIMITER $$

CREATE PROCEDURE sp_checkout_book(
  IN p_member_id BIGINT UNSIGNED,
  IN p_barcode VARCHAR(32),
  IN p_librarian_id BIGINT UNSIGNED,
  OUT p_loan_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_copy_id BIGINT UNSIGNED;
  DECLARE v_book_id BIGINT UNSIGNED;
  DECLARE v_copy_status VARCHAR(20);
  DECLARE v_status VARCHAR(20);
  DECLARE v_expires DATE;
  DECLARE v_type VARCHAR(20);
  DECLARE v_max_loans INT;
  DECLARE v_days INT;
  DECLARE v_max_fines DECIMAL(8,2);
  DECLARE v_active INT;
  DECLARE v_unpaid DECIMAL(8,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;

  SELECT id, book_id, status INTO v_copy_id, v_book_id, v_copy_status
  FROM book_copies WHERE barcode = p_barcode FOR UPDATE;
  IF v_copy_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COPY_NOT_FOUND';
  END IF;

  SELECT status, expires_at, member_type INTO v_status, v_expires, v_type
  FROM members WHERE id = p_member_id FOR UPDATE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MEMBER_NOT_FOUND';
  END IF;
  IF v_status <> 'active' OR v_expires < CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MEMBER_NOT_ACTIVE';
  END IF;

  SELECT max_loans, loan_days, max_unpaid_fines INTO v_max_loans, v_days, v_max_fines
  FROM loan_policies WHERE member_type = v_type;

  SELECT COUNT(*) INTO v_active FROM loans
  WHERE member_id = p_member_id AND returned_at IS NULL;
  IF v_active >= v_max_loans THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'LOAN_LIMIT_REACHED';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_unpaid FROM fines
  WHERE member_id = p_member_id AND status = 'unpaid';
  IF v_unpaid > v_max_fines THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNPAID_FINES';
  END IF;

  IF v_copy_status = 'reserved' THEN
    UPDATE reservations SET status = 'fulfilled'
    WHERE book_id = v_book_id AND member_id = p_member_id AND status = 'ready'
    LIMIT 1;
    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COPY_RESERVED';
    END IF;
  ELSEIF v_copy_status <> 'available' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COPY_NOT_AVAILABLE';
  END IF;

  INSERT INTO loans (copy_id, member_id, checked_out_at, due_at, checked_out_by)
  VALUES (v_copy_id, p_member_id, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL v_days DAY, p_librarian_id);
  SET p_loan_id = LAST_INSERT_ID();

  UPDATE book_copies SET status = 'on_loan' WHERE id = v_copy_id;
  COMMIT;
END$$

CREATE PROCEDURE sp_return_book(
  IN p_barcode VARCHAR(32),
  OUT p_fine DECIMAL(8,2)
)
BEGIN
  DECLARE v_loan_id BIGINT UNSIGNED;
  DECLARE v_copy_id BIGINT UNSIGNED;
  DECLARE v_book_id BIGINT UNSIGNED;
  DECLARE v_member_id BIGINT UNSIGNED;
  DECLARE v_due DATETIME;
  DECLARE v_rate DECIMAL(6,2);
  DECLARE v_hold_days INT;
  DECLARE v_late INT;
  DECLARE v_next BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;

  SELECT l.id, l.copy_id, c.book_id, l.member_id, l.due_at, p.daily_fine, p.hold_days
  INTO v_loan_id, v_copy_id, v_book_id, v_member_id, v_due, v_rate, v_hold_days
  FROM loans l
  JOIN book_copies c ON c.id = l.copy_id
  JOIN members m ON m.id = l.member_id
  JOIN loan_policies p ON p.member_type = m.member_type
  WHERE c.barcode = p_barcode AND l.returned_at IS NULL
  FOR UPDATE;

  IF v_loan_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NO_ACTIVE_LOAN';
  END IF;

  UPDATE loans SET returned_at = UTC_TIMESTAMP() WHERE id = v_loan_id;

  SET v_late = GREATEST(DATEDIFF(UTC_DATE(), DATE(v_due)), 0);
  SET p_fine = v_late * v_rate;
  IF p_fine > 0 THEN
    INSERT INTO fines (loan_id, member_id, amount, reason, status, assessed_at)
    VALUES (v_loan_id, v_member_id, p_fine, 'overdue', 'unpaid', UTC_TIMESTAMP());
  END IF;

  SELECT id INTO v_next FROM reservations
  WHERE book_id = v_book_id AND status = 'waiting'
  ORDER BY reserved_at ASC, id ASC LIMIT 1 FOR UPDATE;

  IF v_next IS NOT NULL THEN
    UPDATE reservations
    SET status = 'ready', ready_at = UTC_TIMESTAMP(), expires_at = UTC_TIMESTAMP() + INTERVAL v_hold_days DAY
    WHERE id = v_next;
    UPDATE book_copies SET status = 'reserved' WHERE id = v_copy_id;
  ELSE
    UPDATE book_copies SET status = 'available' WHERE id = v_copy_id;
  END IF;

  COMMIT;
END$$

CREATE PROCEDURE sp_renew_loan(IN p_loan_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_book_id BIGINT UNSIGNED;
  DECLARE v_member_id BIGINT UNSIGNED;
  DECLARE v_due DATETIME;
  DECLARE v_renewals INT;
  DECLARE v_max_renewals INT;
  DECLARE v_loan_days INT;
  DECLARE v_max_fines DECIMAL(8,2);
  DECLARE v_unpaid DECIMAL(8,2);
  DECLARE v_waiting INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;

  SELECT c.book_id, l.member_id, l.due_at, l.renewals_count, p.max_renewals, p.loan_days, p.max_unpaid_fines
  INTO v_book_id, v_member_id, v_due, v_renewals, v_max_renewals, v_loan_days, v_max_fines
  FROM loans l
  JOIN book_copies c ON c.id = l.copy_id
  JOIN members m ON m.id = l.member_id
  JOIN loan_policies p ON p.member_type = m.member_type
  WHERE l.id = p_loan_id AND l.returned_at IS NULL
  FOR UPDATE;

  IF v_member_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NO_ACTIVE_LOAN'; END IF;
  IF v_renewals >= v_max_renewals THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RENEWAL_LIMIT_REACHED'; END IF;
  IF v_due < UTC_TIMESTAMP() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'LOAN_OVERDUE'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_unpaid FROM fines WHERE member_id = v_member_id AND status = 'unpaid';
  IF v_unpaid > v_max_fines THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNPAID_FINES'; END IF;

  SELECT COUNT(*) INTO v_waiting FROM reservations WHERE book_id = v_book_id AND status = 'waiting';
  IF v_waiting > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'BOOK_HAS_RESERVATIONS'; END IF;

  UPDATE loans
  SET due_at = GREATEST(due_at, UTC_TIMESTAMP()) + INTERVAL v_loan_days DAY,
      renewals_count = renewals_count + 1
  WHERE id = p_loan_id;

  COMMIT;
END$$

CREATE PROCEDURE sp_expire_holds()
BEGIN
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_res_id BIGINT UNSIGNED;
  DECLARE v_book_id BIGINT UNSIGNED;
  DECLARE v_next_id BIGINT UNSIGNED;
  DECLARE v_hold_days INT;
  DECLARE cur CURSOR FOR
    SELECT id, book_id FROM reservations WHERE status = 'ready' AND expires_at < UTC_TIMESTAMP();
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_res_id, v_book_id;
    IF v_done = 1 THEN LEAVE read_loop; END IF;

    UPDATE reservations SET status = 'expired' WHERE id = v_res_id;

    SET v_next_id = NULL;
    SELECT r.id, p.hold_days INTO v_next_id, v_hold_days
    FROM reservations r
    JOIN members m ON m.id = r.member_id
    JOIN loan_policies p ON p.member_type = m.member_type
    WHERE r.book_id = v_book_id AND r.status = 'waiting'
    ORDER BY r.reserved_at ASC, r.id ASC LIMIT 1 FOR UPDATE;

    IF v_next_id IS NOT NULL THEN
      UPDATE reservations
      SET status = 'ready', ready_at = UTC_TIMESTAMP(), expires_at = UTC_TIMESTAMP() + INTERVAL v_hold_days DAY
      WHERE id = v_next_id;
    ELSE
      UPDATE book_copies SET status = 'available'
      WHERE book_id = v_book_id AND status = 'reserved'
      LIMIT 1;
    END IF;
  END LOOP;
  CLOSE cur;
  COMMIT;
END$$

DELIMITER ;
