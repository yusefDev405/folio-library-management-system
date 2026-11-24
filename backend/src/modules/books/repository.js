import { getDb, withTransaction } from '../../config/db.js';

const SORT_COLUMN_MAP = {
  title: 'b.title',
  published_year: 'COALESCE(b.published_year, 0)',
  available_copies: 'v.available_copies',
};

/**
 * Converts user text into safe FTS5 prefix-OR tokens while stripping FTS operators.
 */
function buildSafeFtsQuery(raw) {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9\u00C0-\u024F_-]/g, ''))
    .filter(Boolean)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export function searchBooks({ q, category, author, available, sort, order, limit, offset }) {
  const db = getDb();
  const where = [];
  const params = [];
  let ftsJoin = '';

  const ftsQuery = q ? buildSafeFtsQuery(q) : null;
  if (q && !ftsQuery) {
    return { rows: [], total: 0 };
  }
  if (ftsQuery) {
    ftsJoin = 'JOIN books_fts fts ON fts.rowid = b.id';
    where.push('books_fts MATCH ?');
    params.push(ftsQuery);
  }

  if (category) {
    where.push('b.category_id = ?');
    params.push(category);
  }

  if (author) {
    where.push('EXISTS (SELECT 1 FROM book_authors ba WHERE ba.book_id = b.id AND ba.author_id = ?)');
    params.push(author);
  }

  if (available === true) {
    where.push('v.available_copies > 0');
  } else if (available === false) {
    where.push('v.available_copies = 0');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortExpr = SORT_COLUMN_MAP[sort] || 'b.title';
  const sortDir = order === 'desc' ? 'DESC' : 'ASC';

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM books b
       JOIN v_book_availability v ON v.book_id = b.id
       ${ftsJoin}
       ${whereSql}`
    )
    .get(...params);

  const rows = db
    .prepare(
      `SELECT b.id, b.isbn, b.title, b.publisher, b.published_year, b.category_id, b.description,
              c.name AS category_name,
              v.total_copies, v.available_copies,
              (
                SELECT json_group_array(json_object('id', a.id, 'name', a.name))
                FROM book_authors ba
                JOIN authors a ON a.id = ba.author_id
                WHERE ba.book_id = b.id
              ) AS authors_json
       FROM books b
       JOIN v_book_availability v ON v.book_id = b.id
       LEFT JOIN categories c ON c.id = b.category_id
       ${ftsJoin}
       ${whereSql}
       ORDER BY ${sortExpr} ${sortDir}, b.id ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return {
    total: countRow.total,
    rows: rows.map((row) => ({
      id: row.id,
      isbn: row.isbn,
      title: row.title,
      publisher: row.publisher,
      publishedYear: row.published_year,
      categoryId: row.category_id,
      categoryName: row.category_name,
      description: row.description,
      totalCopies: row.total_copies,
      availableCopies: row.available_copies,
      authors: JSON.parse(row.authors_json || '[]'),
    })),
  };
}

export function findBookById(bookId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT b.id, b.isbn, b.title, b.publisher, b.published_year, b.category_id, b.description,
              c.name AS category_name,
              v.total_copies, v.available_copies
       FROM books b
       JOIN v_book_availability v ON v.book_id = b.id
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE b.id = ?`
    )
    .get(bookId);

  if (!row) return null;

  const authors = db
    .prepare(
      `SELECT a.id, a.name
       FROM book_authors ba
       JOIN authors a ON a.id = ba.author_id
       WHERE ba.book_id = ?
       ORDER BY a.name ASC`
    )
    .all(bookId);

  const copies = db
    .prepare(
      `SELECT id, book_id, barcode, shelf_location, status, acquired_at
       FROM book_copies
       WHERE book_id = ?
       ORDER BY barcode ASC`
    )
    .all(bookId);

  const waitingCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM reservations WHERE book_id = ? AND status IN ('waiting', 'ready')")
    .get(bookId).cnt;

  const ratingSummary = db
    .prepare('SELECT COUNT(*) AS reviewCount, ROUND(AVG(rating), 2) AS averageRating FROM book_reviews WHERE book_id = ?')
    .get(bookId);

  return {
    id: row.id,
    isbn: row.isbn,
    title: row.title,
    publisher: row.publisher,
    publishedYear: row.published_year,
    categoryId: row.category_id,
    categoryName: row.category_name,
    description: row.description,
    totalCopies: row.total_copies,
    availableCopies: row.available_copies,
    waitingReservations: waitingCount,
    reviewCount: ratingSummary.reviewCount,
    averageRating: ratingSummary.averageRating ?? null,
    authors,
    copies: copies.map((cp) => ({
      id: cp.id,
      bookId: cp.book_id,
      barcode: cp.barcode,
      shelfLocation: cp.shelf_location,
      status: cp.status,
      acquiredAt: cp.acquired_at,
    })),
  };
}

export function createBook({ isbn, title, publisher, publishedYear, categoryId, description, authorIds, actorUserId }) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const info = db
      .prepare(
        `INSERT INTO books (isbn, title, publisher, published_year, category_id, description)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(isbn, title, publisher ?? null, publishedYear ?? null, categoryId ?? null, description ?? '');

    const bookId = Number(info.lastInsertRowid);
    const linkStmt = db.prepare('INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)');
    for (const authorId of authorIds) {
      linkStmt.run(bookId, authorId);
    }
    return bookId;
  });
}

export function updateBook(bookId, fields, actorUserId) {
  const db = getDb();
  return withTransaction(db, actorUserId, () => {
    const existing = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
    if (!existing) return false;

    const sets = [];
    const params = [];
    if (fields.title !== undefined) {
      sets.push('title = ?');
      params.push(fields.title);
    }
    if (fields.publisher !== undefined) {
      sets.push('publisher = ?');
      params.push(fields.publisher);
    }
    if (fields.publishedYear !== undefined) {
      sets.push('published_year = ?');
      params.push(fields.publishedYear);
    }
    if (fields.categoryId !== undefined) {
      sets.push('category_id = ?');
      params.push(fields.categoryId);
    }
    if (fields.description !== undefined) {
      sets.push('description = ?');
      params.push(fields.description);
    }

    if (sets.length > 0) {
      params.push(bookId);
      db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }

    if (fields.authorIds !== undefined) {
      db.prepare('DELETE FROM book_authors WHERE book_id = ?').run(bookId);
      const linkStmt = db.prepare('INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)');
      for (const authorId of fields.authorIds) {
        linkStmt.run(bookId, authorId);
      }
    }

    return true;
  });
}

export function importValidBooks(validRows, actorUserId) {
  const db = getDb();
  let imported = 0;
  let skippedDuplicate = 0;

  withTransaction(db, actorUserId, () => {
    for (const r of validRows) {
      const existingBook = db.prepare('SELECT id FROM books WHERE isbn = ?').get(r.isbn);
      if (existingBook) {
        skippedDuplicate += 1;
        continue;
      }

      let cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(r.category);
      if (!cat) {
        const cInfo = db.prepare('INSERT INTO categories (name) VALUES (?)').run(r.category);
        cat = { id: Number(cInfo.lastInsertRowid) };
      }

      let author = db.prepare('SELECT id FROM authors WHERE name = ?').get(r.author);
      if (!author) {
        const aInfo = db.prepare('INSERT INTO authors (name) VALUES (?)').run(r.author);
        author = { id: Number(aInfo.lastInsertRowid) };
      }

      const bInfo = db
        .prepare(
          `INSERT INTO books (isbn, title, publisher, published_year, category_id, description)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(r.isbn, r.title, r.publisher, r.publishedYear, cat.id, r.description);

      db.prepare('INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)').run(
        Number(bInfo.lastInsertRowid),
        author.id
      );
      imported += 1;
    }
  });

  return { imported, skippedDuplicate };
}
