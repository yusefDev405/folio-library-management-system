import { domainError } from '../../utils/errors.js';
import { paginatedEnvelope } from '../../utils/pagination.js';
import { hashPassword } from '../../utils/password.js';
import * as repo from './repository.js';

function mapMemberRow(r) {
  return {
    id: r.id,
    userId: r.user_id,
    email: r.email,
    memberNumber: r.member_number,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    memberType: r.member_type,
    status: r.status,
    joinedAt: r.joined_at,
    expiresAt: r.expires_at,
    maxLoans: r.max_loans,
    maxUnpaidFines: Number(r.max_unpaid_fines),
    activeLoans: r.active_loans,
    overdueLoans: r.overdue_loans,
    unpaidFines: Number(r.unpaid_fines),
  };
}

export function listMembers(query) {
  const { page, limit } = query;
  const offset = (page - 1) * limit;
  const { rows, total } = repo.listMembers({
    q: query.q,
    status: query.status,
    memberType: query.memberType,
    limit,
    offset,
  });
  return paginatedEnvelope(rows.map(mapMemberRow), { page, limit, total });
}

export function getMember(memberId) {
  const found = repo.findMemberById(memberId);
  if (!found) throw domainError('MEMBER_NOT_FOUND');
  return {
    ...mapMemberRow(found.row),
    loans: found.activeLoans.map((l) => ({
      id: l.id,
      copyId: l.copy_id,
      barcode: l.barcode,
      bookId: l.book_id,
      title: l.title,
      isbn: l.isbn,
      checkedOutAt: l.checked_out_at,
      dueAt: l.due_at,
      renewalsCount: l.renewals_count,
    })),
    fines: found.unpaidFines.map((f) => ({
      id: f.id,
      loanId: f.loan_id,
      amount: Number(f.amount),
      reason: f.reason,
      status: f.status,
      assessedAt: f.assessed_at,
    })),
  };
}

export async function createMember(body, actorUserId) {
  const passwordHash = await hashPassword(body.password);
  const memberId = repo.createMember({
    ...body,
    passwordHash,
    actorUserId,
  });
  return getMember(memberId);
}

export function updateMember(memberId, body, actorUserId) {
  repo.updateMember(memberId, body, actorUserId);
  return getMember(memberId);
}
