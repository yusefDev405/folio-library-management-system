import { AppError, domainError } from '../../utils/errors.js';
import * as repo from './repository.js';

function mapReservation(r) {
  return {
    id: r.id,
    bookId: r.book_id,
    title: r.title,
    isbn: r.isbn,
    memberId: r.member_id,
    reservedAt: r.reserved_at,
    status: r.status,
    readyAt: r.ready_at,
    expiresAt: r.expires_at,
    queuePosition: r.queue_position,
  };
}

export function createReservation(bookId, user) {
  if (!user.memberId) {
    throw new AppError(403, 'MEMBER_PROFILE_REQUIRED', 'Only member accounts can place reservations.');
  }
  const row = repo.createReservation({
    bookId,
    memberId: user.memberId,
    actorUserId: user.id,
  });
  return mapReservation(row);
}

export function listMyReservations(user) {
  if (!user.memberId) return [];
  return repo.listMemberReservations(user.memberId).map(mapReservation);
}

export function cancelReservation(reservationId, user) {
  const existing = repo.findReservationById(reservationId);
  if (!existing) throw domainError('RESERVATION_NOT_FOUND');

  if (user.role === 'member' && existing.member_id !== user.memberId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only cancel your own reservations.');
  }

  repo.cancelReservation(reservationId, user.id);
}
