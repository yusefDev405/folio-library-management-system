import { getDb } from '../config/db.js';
import { AppError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/tokens.js';

export function authenticate(req, _res, next) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.'));
  }

  const token = header.slice(7).trim();
  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.'));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired.'));
  }

  const userId = Number(payload.sub);
  const db = getDb();
  const user = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.is_active, m.id AS member_id
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId);

  if (!user || !user.is_active) {
    return next(new AppError(401, 'ACCOUNT_DISABLED', 'User account is inactive or no longer exists.'));
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    memberId: user.member_id ?? null,
  };
  return next();
}
