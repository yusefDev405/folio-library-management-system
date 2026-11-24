import { getDb, withTransaction } from '../../config/db.js';
import { addDaysIso, nowIso } from '../../utils/errors.js';

export function findUserByEmail(email) {
  return getDb()
    .prepare(
      `SELECT u.id, u.email, u.password_hash, u.role, u.is_active, u.created_at,
              m.id AS member_id, m.member_number, m.first_name, m.last_name,
              m.member_type, m.status AS member_status, m.expires_at
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       WHERE u.email = ?`
    )
    .get(email);
}

export function findUserProfileById(userId) {
  return getDb()
    .prepare(
      `SELECT u.id, u.email, u.role, u.is_active, u.created_at,
              m.id AS member_id, m.member_number, m.first_name, m.last_name, m.phone,
              m.member_type, m.status AS member_status, m.joined_at, m.expires_at
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId);
}

export function findUserPasswordById(userId) {
  return getDb()
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .get(userId);
}

export function storeRefreshToken({ userId, tokenHash, ttlDays }) {
  const expiresAt = addDaysIso(nowIso(), ttlDays);
  getDb()
    .prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(userId, tokenHash, expiresAt);
  return expiresAt;
}

export function findRefreshTokenByHash(tokenHash) {
  return getDb()
    .prepare('SELECT id, user_id, token_hash, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?')
    .get(tokenHash);
}

export function rotateRefreshToken({ oldTokenId, userId, newTokenHash, ttlDays }) {
  const now = nowIso();
  const expiresAt = addDaysIso(now, ttlDays);
  return withTransaction(getDb(), userId, () => {
    getDb()
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?')
      .run(now, oldTokenId);
    getDb()
      .prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(userId, newTokenHash, expiresAt);
    return expiresAt;
  });
}

export function revokeRefreshTokenByHash(tokenHash) {
  getDb()
    .prepare('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?')
    .run(nowIso(), tokenHash);
}

export function revokeAllUserRefreshTokens(userId) {
  getDb()
    .prepare('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?')
    .run(nowIso(), userId);
}

export function updateUserPassword(userId, newHash) {
  const now = nowIso();
  return withTransaction(getDb(), userId, () => {
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
    getDb()
      .prepare('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?')
      .run(now, userId);
  });
}
