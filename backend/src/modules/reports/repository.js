import { getDb } from '../../config/db.js';

export function getOverdueReport() {
  return getDb()
    .prepare(
      `SELECT loan_id AS loanId, member_id AS memberId, member_number AS memberNumber,
              member_name AS memberName, book_id AS bookId, title, barcode,
              due_at AS dueAt, days_overdue AS daysOverdue
       FROM v_overdue_loans
       ORDER BY days_overdue DESC, due_at ASC`
    )
    .all();
}

export function getPopularBooksReport() {
  return getDb()
    .prepare(
      `WITH counts AS (
         SELECT b.category_id, COALESCE(cat.name, 'Uncategorized') AS category_name,
                b.id AS book_id, b.title, b.isbn, COUNT(*) AS loan_count
         FROM loans l
         JOIN book_copies c ON c.id = l.copy_id
         JOIN books b ON b.id = c.book_id
         LEFT JOIN categories cat ON cat.id = b.category_id
         WHERE datetime(l.checked_out_at) >= datetime('now', '-1 year')
         GROUP BY b.category_id, cat.name, b.id, b.title, b.isbn
       )
       SELECT category_id AS categoryId,
              category_name AS categoryName,
              book_id AS bookId,
              title,
              isbn,
              loan_count AS loanCount,
              RANK() OVER (PARTITION BY category_id ORDER BY loan_count DESC) AS rankInCategory
       FROM counts
       ORDER BY category_name ASC, rankInCategory ASC, title ASC`
    )
    .all();
}

export function getInventoryReport() {
  const db = getDb();
  const byCategoryAndStatus = db
    .prepare(
      `SELECT category_id AS categoryId,
              COALESCE(category_name, 'Uncategorized') AS categoryName,
              status,
              copy_count AS copyCount
       FROM v_inventory_status
       ORDER BY categoryName ASC, status ASC`
    )
    .all();

  const totalsByStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS copyCount
       FROM book_copies
       GROUP BY status
       ORDER BY status ASC`
    )
    .all();

  return { byCategoryAndStatus, totalsByStatus };
}

export function getAnalyticsDashboard() {
  const db = getDb();

  const kpis = {
    totalBooks: db.prepare('SELECT COUNT(*) AS c FROM books').get().c,
    totalCopies: db.prepare('SELECT COUNT(*) AS c FROM book_copies').get().c,
    activeLoans: db.prepare('SELECT COUNT(*) AS c FROM loans WHERE returned_at IS NULL').get().c,
    overdueLoans: db.prepare('SELECT COUNT(*) AS c FROM v_overdue_loans').get().c,
    activeMembers: db.prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'active'").get().c,
    activeHolds: db
      .prepare("SELECT COUNT(*) AS c FROM reservations WHERE status IN ('waiting', 'ready')")
      .get().c,
  };

  const loansByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', checked_out_at) AS month, COUNT(*) AS loanCount
       FROM loans
       GROUP BY strftime('%Y-%m', checked_out_at)
       ORDER BY month ASC
       LIMIT 12`
    )
    .all();

  const loansByCategory = db
    .prepare(
      `SELECT COALESCE(cat.name, 'Uncategorized') AS categoryName, COUNT(*) AS loanCount
       FROM loans l
       JOIN book_copies c ON c.id = l.copy_id
       JOIN books b ON b.id = c.book_id
       LEFT JOIN categories cat ON cat.id = b.category_id
       GROUP BY categoryName
       ORDER BY loanCount DESC, categoryName ASC`
    )
    .all();

  const finesSummary = db
    .prepare(
      `SELECT status, COUNT(*) AS count, ROUND(COALESCE(SUM(amount), 0), 2) AS totalAmount
       FROM fines
       GROUP BY status
       ORDER BY status ASC`
    )
    .all();

  const copyStatusBreakdown = db
    .prepare(
      `SELECT status, COUNT(*) AS copyCount
       FROM book_copies
       GROUP BY status
       ORDER BY copyCount DESC`
    )
    .all();

  return {
    kpis,
    loansByMonth,
    loansByCategory,
    finesSummary,
    copyStatusBreakdown,
  };
}
