import { AppError } from '../utils/errors.js';

/**
 * Requires a custom header on cookie-authenticated routes (/auth/refresh, /auth/logout)
 * to stop cross-site form/fetch CSRF alongside SameSite=Strict cookies.
 */
export function requireCsrfHeader(req, _res, next) {
  const xRequestedWith = req.get('x-requested-with');
  if (!xRequestedWith) {
    return next(
      new AppError(403, 'CSRF_HEADER_REQUIRED', 'Missing X-Requested-With security header.')
    );
  }
  return next();
}
