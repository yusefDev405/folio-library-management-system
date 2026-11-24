# Engine Comparison: MySQL 8 vs PostgreSQL vs SQLite 3.51

| Feature | PostgreSQL | MySQL 8.0 (`db/mysql/`) | SQLite 3.51 (Zero-Docker Runtime) |
|---|---|---|---|
| **Auto IDs** | `GENERATED ... AS IDENTITY` | `AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| **Partial Unique Index** | `CREATE UNIQUE INDEX ... WHERE returned_at IS NULL` | `active_copy_id` `GENERATED ALWAYS AS (...) STORED` + `UNIQUE KEY` | `active_copy_id` `GENERATED ALWAYS AS (...) STORED` + `UNIQUE INDEX` |
| **Error Signaling** | `RAISE EXCEPTION` | `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '...'` | Transactional JS procedure throws mapped `AppError(code)` inside `BEGIN IMMEDIATE` |
| **Routine Syntax** | `$$` bodies, `CREATE PROCEDURE` | `DELIMITER $$` with `IN`/`OUT` params + `EXIT HANDLER` | Atomic `withTransaction(db, actorId, fn)` in `backend/src/db/procedures.js` |
| **JSON Columns** | `JSONB` | `JSON` | `TEXT` + `json_object()` / `json_group_array()` |
| **Full-Text Search** | `tsvector` + GIN index | `FULLTEXT` index + `MATCH ... AGAINST` | `FTS5` virtual table (`books_fts`) + sync triggers |
| **Scheduled Jobs** | `pg_cron` extension | Built-in `CREATE EVENT` (`event_scheduler = ON`) | Unref'd hourly timer in `server.js` + `POST /admin/expire-holds` |
| **Case-Insensitive Text** | `lower()` index or `citext` | Default collation (`utf8mb4_unicode_ci`) | `COLLATE NOCASE` on email, member_number, barcode, title |

## Microsoft SQL Server (T-SQL) Portability Notes
If porting `sp_checkout_book` and `sp_return_book` to T-SQL:
- Replace `AUTO_INCREMENT` with `IDENTITY(1,1)` and `JSON` with `NVARCHAR(MAX)` (`ISJSON(...)` check constraint).
- Replace `SIGNAL SQLSTATE '45000'` and `DECLARE EXIT HANDLER` with `BEGIN TRY ... BEGIN TRAN ... COMMIT TRAN ... END TRY BEGIN CATCH ROLLBACK TRAN; THROW; END CATCH`.
- Replace MySQL's `FOR UPDATE` row locking with `WITH (UPDLOCK, HOLDLOCK)` table hints and use a filtered unique index (`CREATE UNIQUE INDEX uq_loans_active ON loans(copy_id) WHERE returned_at IS NULL`) just like PostgreSQL.
