import fs from 'node:fs';
import path from 'node:path';
import { getDb, runMigrations, withTransaction } from '../backend/src/config/db.js';
import { ROOT_DIR } from '../backend/src/config/env.js';
import { parseBooksCsv } from '../backend/src/utils/isbnCsv.js';

const inputPath = process.argv[2]
  ? path.resolve(ROOT_DIR, process.argv[2])
  : path.join(ROOT_DIR, 'db', 'seeds', 'legacy_books_sample.csv');

const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(inputPath)) {
  throw new Error(`CSV file not found: ${inputPath}`);
}

const { validRows, rejectedRows } = parseBooksCsv(fs.readFileSync(inputPath, 'utf8'));

const errorsOutPath = inputPath.replace(/\.csv$/i, '-errors.csv');
if (rejectedRows.length > 0) {
  const errCsv = ['line,isbn,title,reason']
    .concat(
      rejectedRows.map(
        (r) =>
          `${r.line},"${r.isbn.replace(/"/g, '""')}","${r.title.replace(/"/g, '""')}",${r.reason}`
      )
    )
    .join('\n');
  fs.writeFileSync(errorsOutPath, errCsv + '\n', 'utf8');
}

let imported = 0;
let skippedDuplicate = 0;

if (!dryRun) {
  const db = getDb();
  runMigrations(db);
  withTransaction(db, null, () => {
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
  db.close();
}

console.log(
  JSON.stringify({
    status: dryRun ? 'dry_run' : 'imported',
    inputFile: inputPath,
    validCount: validRows.length,
    imported,
    skippedDuplicate,
    rejectedCount: rejectedRows.length,
    errorsFile: rejectedRows.length > 0 ? errorsOutPath : null,
  })
);
