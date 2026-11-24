export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DOMAIN_ERROR_CATALOG = {
  COPY_NOT_FOUND: { status: 404, message: 'No physical copy matches that barcode.' },
  MEMBER_NOT_FOUND: { status: 404, message: 'Member account was not found.' },
  BOOK_NOT_FOUND: { status: 404, message: 'Book record was not found.' },
  LOAN_NOT_FOUND: { status: 404, message: 'Loan record was not found.' },
  NO_ACTIVE_LOAN: { status: 404, message: 'No active loan exists for that copy or loan.' },
  RESERVATION_NOT_FOUND: { status: 404, message: 'Reservation record was not found.' },
  FINE_NOT_FOUND: { status: 404, message: 'Fine record was not found.' },
  USER_NOT_FOUND: { status: 404, message: 'User account was not found.' },
  POLICY_NOT_FOUND: { status: 404, message: 'Loan policy was not found.' },
  MEMBER_NOT_ACTIVE: { status: 409, message: 'Member account is inactive or membership has expired.' },
  LOAN_LIMIT_REACHED: { status: 409, message: 'This member has reached their maximum simultaneous loan limit.' },
  UNPAID_FINES: { status: 409, message: 'Unpaid fines exceed the policy limit for borrowing or renewal.' },
  COPY_RESERVED: { status: 409, message: 'This copy is currently held for another member.' },
  COPY_NOT_AVAILABLE: { status: 409, message: 'This copy is not available for checkout.' },
  RENEWAL_LIMIT_REACHED: { status: 409, message: 'This loan has already reached the maximum number of renewals.' },
  LOAN_OVERDUE: { status: 409, message: 'Overdue loans cannot be renewed; return the item first.' },
  BOOK_HAS_RESERVATIONS: { status: 409, message: 'Cannot renew because another member is waiting in the reservation queue.' },
  COPY_AVAILABLE_NO_RESERVE: { status: 409, message: 'At least one copy is currently available on the shelf; no reservation is needed.' },
  RESERVATION_EXISTS: { status: 409, message: 'You already have an active reservation for this book.' },
  RESERVATION_NOT_ACTIVE: { status: 409, message: 'This reservation is no longer active.' },
  FINE_ALREADY_SETTLED: { status: 409, message: 'This fine has already been paid or waived.' },
  DUPLICATE_EMAIL: { status: 409, message: 'An account with that email address already exists.' },
  DUPLICATE_ISBN: { status: 409, message: 'A book with that ISBN already exists.' },
  DUPLICATE_BARCODE: { status: 409, message: 'A copy with that barcode already exists.' },
  DUPLICATE_MEMBER_NUMBER: { status: 409, message: 'That member number is already assigned.' },
  DUPLICATE_CATEGORY: { status: 409, message: 'That category already exists.' },
  INVALID_TRANSITION: { status: 409, message: 'Requested status change is not permitted while the copy is on loan or reserved.' },
  STOCKTAKE_NOT_FOUND: { status: 404, message: 'Stocktake session was not found.' },
  STOCKTAKE_CLOSED: { status: 409, message: 'This stocktake session is already closed.' },
  NOTIFICATION_NOT_FOUND: { status: 404, message: 'Notification was not found.' },
  REVIEW_NOT_FOUND: { status: 404, message: 'Review was not found.' },
};

export function domainError(code, overrideMessage = undefined) {
  const entry = DOMAIN_ERROR_CATALOG[code] || { status: 409, message: code };
  return new AppError(entry.status, code, overrideMessage || entry.message);
}

export function calculateOverdueFine(dueAtIso, returnedAtIso, dailyFine) {
  const dueMs = Date.UTC(
    Number(dueAtIso.slice(0, 4)),
    Number(dueAtIso.slice(5, 7)) - 1,
    Number(dueAtIso.slice(8, 10))
  );
  const retMs = Date.UTC(
    Number(returnedAtIso.slice(0, 4)),
    Number(returnedAtIso.slice(5, 7)) - 1,
    Number(returnedAtIso.slice(8, 10))
  );
  const daysLate = Math.max(0, Math.floor((retMs - dueMs) / 86_400_000));
  const fineCents = daysLate * Math.round(Number(dailyFine) * 100);
  return {
    daysLate,
    amount: Number((fineCents / 100).toFixed(2)),
  };
}

export function addDaysIso(baseIso, days) {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
