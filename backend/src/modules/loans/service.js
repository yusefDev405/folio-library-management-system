import { AppError, domainError } from '../../utils/errors.js';
import { paginatedEnvelope } from '../../utils/pagination.js';
import * as repo from './repository.js';

function mapLoan(r) {
  return {
    id: r.id,
    copyId: r.copy_id,
    bookId: r.book_id,
    title: r.title,
    isbn: r.isbn,
    barcode: r.barcode,
    memberId: r.member_id,
    memberNumber: r.member_number ?? undefined,
    memberName: r.member_name ?? undefined,
    checkedOutAt: r.checked_out_at,
    dueAt: r.due_at,
    returnedAt: r.returned_at,
    renewalsCount: r.renewals_count,
    maxRenewals: r.max_renewals,
    isOverdue: Boolean(r.is_overdue),
  };
}

export function checkout({ memberId, barcode }, librarianId) {
  return repo.checkout({ memberId, barcode, librarianId });
}

export function returnBook({ barcode }, actorUserId) {
  return repo.returnBook({ barcode, actorUserId });
}

export function renewLoan(loanId, user) {
  const loan = repo.findLoanOwnership(loanId);
  if (!loan) throw domainError('LOAN_NOT_FOUND');

  // Ownership check: members may renew only their own loans
  if (user.role === 'member' && loan.member_id !== user.memberId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only renew your own loans.');
  }

  return repo.renewLoan({ loanId, actorUserId: user.id });
}

export function listLoans(query) {
  const { page, limit } = query;
  const offset = (page - 1) * limit;
  const { rows, total } = repo.listLoans({
    status: query.status,
    memberId: query.memberId,
    limit,
    offset,
  });
  return paginatedEnvelope(rows.map(mapLoan), { page, limit, total });
}

export function listMyLoans(user, query, history = false) {
  if (!user.memberId) {
    return paginatedEnvelope([], { page: query.page, limit: query.limit, total: 0 });
  }
  const offset = (query.page - 1) * query.limit;
  const { rows, total } = repo.listMemberLoans({
    memberId: user.memberId,
    history,
    limit: query.limit,
    offset,
  });
  return paginatedEnvelope(rows.map(mapLoan), {
    page: query.page,
    limit: query.limit,
    total,
  });
}
