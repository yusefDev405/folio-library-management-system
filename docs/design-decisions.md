# Architectural & Schema Design Decisions

1. **Books vs. Physical Copies**
   - `books` stores bibliographic metadata (ISBN, title, authors, category, description).
   - `book_copies` stores physical inventory items (`barcode`, `shelf_location`, `status`: `available`, `on_loan`, `reserved`, `lost`, `damaged`).
   - `loans` always reference `copy_id`, never `book_id`. This accurately tracks which exact physical item is checked out, lost, or held.

2. **Database-Enforced One-Active-Loan-Per-Copy (Generated Column Trick)**
   - SQLite (and MySQL 8) enforce at most one active loan per physical copy using a `STORED` generated column:
     ```sql
     active_copy_id INTEGER GENERATED ALWAYS AS (
       CASE WHEN returned_at IS NULL THEN copy_id ELSE NULL END
     ) STORED
     ```
     paired with `CREATE UNIQUE INDEX uq_loans_one_active_per_copy ON loans(active_copy_id);`.
   - Closed loans evaluate `active_copy_id` to `NULL`, and SQL `UNIQUE` indexes permit multiple `NULL` values while rejecting two concurrent open loans for the same `copy_id`.
   - The same pattern (`active_member_book`) guarantees at most one open (`waiting` or `ready`) reservation per member and book.

3. **Transactional Circulation Procedures**
   - Critical state transitions (`spCheckoutBook`, `spReturnBook`, `spRenewLoan`, `spExpireHolds` in `backend/src/db/procedures.js` and MySQL 8 equivalents in `db/mysql/004_procedures.sql`) execute inside `BEGIN IMMEDIATE` transactions with `app_context.actor_user_id` set so triggers always log the authenticated actor.

4. **Policy Table (`loan_policies`)**
   - Borrowing caps, loan durations, renewal limits, daily fine rates, unpaid-fine blocking thresholds, and hold durations live in `loan_policies`, allowing administrators to adjust rules without code deployments.

5. **Exact Monetary Arithmetic & Soft Deactivation**
   - Overdue fines are computed in integer cents (`Math.round(dailyFine * 100) * daysLate / 100`) and stored as `NUMERIC`/`DECIMAL(8,2)` with `CHECK (amount > 0)`.
   - Foreign keys use `ON DELETE RESTRICT` to preserve circulation history; accounts and copies use status columns (`suspended`, `expired`, `lost`, `damaged`, `is_active = 0`) instead of destructive deletes.

6. **Zero-Heavy-Install Runtime Parity**
   - To run with zero Docker containers, zero external DB daemons, and zero native C++ compilation on Windows, the active runtime uses Node.js 24's built-in `node:sqlite` (SQLite 3.51.3 with FTS5 and generated columns) and `node:crypto` `scrypt`, while `db/mysql/` retains the complete MySQL 8 DDL, stored procedures, triggers, events, and shell scripts.
