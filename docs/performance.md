# Query Optimization & Performance Benchmarks

All benchmarks were measured via `npm run bench` (`scripts/benchmark.js`) on an **ephemeral `:memory:` SQLite 3.51.3 database** (0 bytes persisted to disk) populated with **2,500 books** and **8,000 loans**.

## 1. Catalogue Search: `LIKE '%Distributed%'` vs. `FTS5 MATCH`

### Queries Compared
- **Unindexed wildcard scan**:
  ```sql
  SELECT id, title FROM books
  WHERE title LIKE '%Distributed%' OR description LIKE '%Distributed%';
  ```
- **FTS5 full-text search** (`db/migrations/004_fts.sql`, triggered on `books` INSERT/UPDATE/DELETE):
  ```sql
  SELECT b.id, b.title FROM books b
  JOIN books_fts f ON f.rowid = b.id
  WHERE books_fts MATCH '"Distributed"*';
  ```

### Observed Plans & Timings (`npm run bench`)
| Approach | `EXPLAIN QUERY PLAN` Detail | Avg Query Time |
|---|---|---|
| `LIKE '%Distributed%'` | `SCAN books` | `2.109 ms` |
| `FTS5 MATCH` | `SCAN f VIRTUAL TABLE INDEX 0:M2` + `SEARCH b USING INTEGER PRIMARY KEY (rowid=?)` | `0.164 ms` |

Result: **~12.9x faster** by eliminating full-table string scanning across `title` and `description`.

---

## 2. Overdue Report: Full Scan vs. Composite Index `(returned_at, due_at)`

### Query Compared
```sql
SELECT l.id, l.due_at
FROM loans l
WHERE l.returned_at IS NULL AND l.due_at < '2026-11-24T00:00:00Z';
```

### Observed Plans & Timings (`npm run bench`)
| Index State | `EXPLAIN QUERY PLAN` Detail | Avg Query Time |
|---|---|---|
| Without `idx_loans_returned_due` | `SCAN l` | `1.137 ms` |
| With `idx_loans_returned_due (returned_at, due_at)` | `SEARCH l USING COVERING INDEX idx_loans_returned_due (returned_at=? AND due_at<?)` | `0.142 ms` |

Result: **~8.0x faster** and served directly from the covering composite index without touching the main `loans` B-tree pages.

---

## 3. MySQL 8 Equivalent (`db/mysql/explain_demo.sql`)

In MySQL 8.0 (`db/mysql/001_schema.sql`), the same two optimizations map to:
- `FULLTEXT KEY ft_books_title_desc (title, description)` queried with `MATCH(title, description) AGAINST (? IN NATURAL LANGUAGE MODE)`
- Composite B-tree index `idx_loans_returned_due (returned_at, due_at)` verified with `EXPLAIN ANALYZE`
