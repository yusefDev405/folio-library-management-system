-- MySQL 8.0 Reference: EXPLAIN ANALYZE Comparison Queries
-- 1. Slow wildcard scan vs FULLTEXT index
EXPLAIN ANALYZE
SELECT id, title FROM books WHERE title LIKE '%Distributed%';

EXPLAIN ANALYZE
SELECT id, title FROM books WHERE MATCH(title, description) AGAINST ('Distributed' IN NATURAL LANGUAGE MODE);

-- 2. Overdue report leveraging composite index (returned_at, due_at)
EXPLAIN ANALYZE
SELECT id, copy_id, member_id, due_at
FROM loans
WHERE returned_at IS NULL AND due_at < UTC_TIMESTAMP();
