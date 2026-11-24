import { domainError } from '../../utils/errors.js';
import { paginatedEnvelope } from '../../utils/pagination.js';
import * as repo from './repository.js';

export function listBooks(query) {
  const { page, limit } = query;
  const offset = (page - 1) * limit;
  const { rows, total } = repo.searchBooks({
    q: query.q,
    category: query.category,
    author: query.author,
    available: query.available,
    sort: query.sort,
    order: query.order,
    limit,
    offset,
  });
  return paginatedEnvelope(rows, { page, limit, total });
}

export function getBook(bookId) {
  const book = repo.findBookById(bookId);
  if (!book) throw domainError('BOOK_NOT_FOUND');
  return book;
}

export function createBook(data, actorUserId) {
  const bookId = repo.createBook({ ...data, actorUserId });
  return repo.findBookById(bookId);
}

export function updateBook(bookId, data, actorUserId) {
  const updated = repo.updateBook(bookId, data, actorUserId);
  if (!updated) throw domainError('BOOK_NOT_FOUND');
  return repo.findBookById(bookId);
}
