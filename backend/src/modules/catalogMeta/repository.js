import { getDb } from '../../config/db.js';
import { domainError } from '../../utils/errors.js';

export function listAuthors() {
  return getDb().prepare('SELECT id, name FROM authors ORDER BY name ASC').all();
}

export function createAuthor(name) {
  const info = getDb().prepare('INSERT INTO authors (name) VALUES (?)').run(name);
  return getDb().prepare('SELECT id, name FROM authors WHERE id = ?').get(Number(info.lastInsertRowid));
}

export function listCategories() {
  return getDb()
    .prepare('SELECT id, name, parent_id AS parentId FROM categories ORDER BY name ASC')
    .all();
}

export function createCategory({ name, parentId = null }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (existing) throw domainError('DUPLICATE_CATEGORY');

  const info = db
    .prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)')
    .run(name, parentId ?? null);
  return db
    .prepare('SELECT id, name, parent_id AS parentId FROM categories WHERE id = ?')
    .get(Number(info.lastInsertRowid));
}
