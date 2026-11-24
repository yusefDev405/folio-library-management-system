-- 004_fts.sql
-- Rollback note: DROP TRIGGER IF EXISTS trg_books_fts_au, trg_books_fts_ad, trg_books_fts_ai; DROP TABLE IF EXISTS books_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
  title,
  description,
  content='books',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_books_fts_ai AFTER INSERT ON books BEGIN
  INSERT INTO books_fts(rowid, title, description)
  VALUES (NEW.id, NEW.title, COALESCE(NEW.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_books_fts_ad AFTER DELETE ON books BEGIN
  INSERT INTO books_fts(books_fts, rowid, title, description)
  VALUES ('delete', OLD.id, OLD.title, COALESCE(OLD.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_books_fts_au AFTER UPDATE ON books BEGIN
  INSERT INTO books_fts(books_fts, rowid, title, description)
  VALUES ('delete', OLD.id, OLD.title, COALESCE(OLD.description, ''));
  INSERT INTO books_fts(rowid, title, description)
  VALUES (NEW.id, NEW.title, COALESCE(NEW.description, ''));
END;
