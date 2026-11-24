import * as repo from './repository.js';

function mapCopy(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    barcode: row.barcode,
    shelfLocation: row.shelf_location,
    status: row.status,
    acquiredAt: row.acquired_at,
  };
}

export function addCopy(bookId, data, actorUserId) {
  const row = repo.createCopy({ bookId, ...data, actorUserId });
  return mapCopy(row);
}

export function updateCopy(copyId, data, actorUserId) {
  const row = repo.updateCopy(copyId, data, actorUserId);
  return mapCopy(row);
}
