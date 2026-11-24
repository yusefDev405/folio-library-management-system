import { AppError } from '../utils/errors.js';
import { logEvent } from '../utils/logger.js';

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'The requested endpoint does not exist.'));
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // SQLite constraint safety net (e.g. direct constraint violations)
  if (err?.code === 'ERR_SQLITE_ERROR' || /UNIQUE constraint failed|CHECK constraint failed|FOREIGN KEY constraint failed/i.test(err?.message || '')) {
    const msg = err.message || '';
    if (msg.includes('uq_loans_one_active_per_copy')) {
      return res.status(409).json({
        error: {
          code: 'COPY_NOT_AVAILABLE',
          message: 'This copy already has an active loan.',
        },
      });
    }
    if (msg.includes('uq_reservations_one_open')) {
      return res.status(409).json({
        error: {
          code: 'RESERVATION_EXISTS',
          message: 'You already have an open reservation for this book.',
        },
      });
    }
    if (msg.includes('books.isbn')) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_ISBN', message: 'A book with that ISBN already exists.' },
      });
    }
    if (msg.includes('book_copies.barcode')) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_BARCODE', message: 'A copy with that barcode already exists.' },
      });
    }
    if (msg.includes('users.email')) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_EMAIL', message: 'An account with that email already exists.' },
      });
    }
    if (msg.includes('members.member_number')) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_MEMBER_NUMBER', message: 'That member number is already assigned.' },
      });
    }
  }

  logEvent('error', 'unhandled_error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    errorMessage: err?.message,
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected server error occurred.',
    },
  });
}
