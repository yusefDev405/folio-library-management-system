import { AppError } from '../utils/errors.js';

const ROLE_LEVEL = {
  member: 1,
  librarian: 2,
  admin: 3,
};

/**
 * Enforces RBAC where 'admin' can do everything 'librarian' can do.
 */
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'));
    }

    const userRole = req.user.role;
    const isDirectlyAllowed = allowedRoles.includes(userRole);
    const adminCoversLibrarian = userRole === 'admin' && allowedRoles.includes('librarian');

    if (!isDirectlyAllowed && !adminCoversLibrarian) {
      return next(
        new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
      );
    }
    return next();
  };
}

export function hasRoleOrHigher(role, minimumRole) {
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[minimumRole] ?? 99);
}
