-- 002_policies.sql
-- Rollback note: DELETE FROM loan_policies WHERE member_type IN ('student', 'staff', 'external');

INSERT OR IGNORE INTO loan_policies (member_type, max_loans, loan_days, max_renewals, daily_fine, max_unpaid_fines, hold_days)
VALUES
  ('student',  5, 14, 2, 0.50, 10.00, 3),
  ('staff',   10, 30, 3, 0.25, 25.00, 5),
  ('external', 3, 14, 1, 1.00,  5.00, 3);
