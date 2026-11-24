import { paginatedEnvelope } from '../../utils/pagination.js';
import * as repo from './repository.js';

function mapFine(r) {
  return {
    id: r.id,
    loanId: r.loan_id,
    memberId: r.member_id,
    memberNumber: r.member_number ?? undefined,
    memberName: r.member_name ?? undefined,
    title: r.title,
    barcode: r.barcode,
    amount: Number(r.amount),
    reason: r.reason,
    status: r.status,
    assessedAt: r.assessed_at,
    paidAt: r.paid_at,
  };
}

export function listMyFines(user) {
  if (!user.memberId) return [];
  return repo.listMemberFines(user.memberId).map(mapFine);
}

export function listFines(query) {
  const offset = (query.page - 1) * query.limit;
  const { rows, total } = repo.listFines({
    status: query.status,
    memberId: query.memberId,
    limit: query.limit,
    offset,
  });
  return paginatedEnvelope(rows.map(mapFine), {
    page: query.page,
    limit: query.limit,
    total,
  });
}

export function payFine(fineId, actorUserId) {
  return mapFine(repo.settleFine(fineId, 'paid', actorUserId));
}

export function waiveFine(fineId, actorUserId) {
  return mapFine(repo.settleFine(fineId, 'waived', actorUserId));
}
