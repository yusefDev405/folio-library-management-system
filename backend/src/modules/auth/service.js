import { env } from '../../config/env.js';
import { AppError, nowIso } from '../../utils/errors.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '../../utils/tokens.js';
import * as repo from './repository.js';

export async function login({ email, password }) {
  const user = repo.findUserByEmail(email);
  if (!user || !user.is_active) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    memberId: user.member_id ?? null,
  });

  const refreshToken = generateRefreshToken();
  repo.storeRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    ttlDays: env.refreshTokenDays,
  });

  return {
    accessToken,
    refreshToken,
    user: sanitizeProfile(user),
  };
}

export function refresh(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new AppError(401, 'REFRESH_TOKEN_MISSING', 'Refresh token cookie is required.');
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);
  const record = repo.findRefreshTokenByHash(tokenHash);
  if (!record) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid.');
  }

  // Reuse detection: if a revoked token is presented again, revoke ALL tokens for this user
  if (record.revoked_at !== null) {
    repo.revokeAllUserRefreshTokens(record.user_id);
    throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'Refresh token was already used; all sessions revoked.');
  }

  if (record.expires_at < nowIso()) {
    repo.revokeRefreshTokenByHash(tokenHash);
    throw new AppError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token has expired.');
  }

  const user = repo.findUserProfileById(record.user_id);
  if (!user || !user.is_active) {
    repo.revokeAllUserRefreshTokens(record.user_id);
    throw new AppError(401, 'ACCOUNT_DISABLED', 'Account is inactive.');
  }

  const nextRefresh = generateRefreshToken();
  repo.rotateRefreshToken({
    oldTokenId: record.id,
    userId: user.id,
    newTokenHash: hashRefreshToken(nextRefresh),
    ttlDays: env.refreshTokenDays,
  });

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    memberId: user.member_id ?? null,
  });

  return {
    accessToken,
    refreshToken: nextRefresh,
    user: sanitizeProfile(user),
  };
}

export function logout(rawRefreshToken) {
  if (rawRefreshToken) {
    repo.revokeRefreshTokenByHash(hashRefreshToken(rawRefreshToken));
  }
}

export function getProfile(userId) {
  const user = repo.findUserProfileById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User account was not found.');
  }
  return sanitizeProfile(user);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = repo.findUserPasswordById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User account was not found.');
  }
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  const newHash = await hashPassword(newPassword);
  repo.updateUserPassword(userId, newHash);
}

function sanitizeProfile(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    member: row.member_id
      ? {
          id: row.member_id,
          memberNumber: row.member_number,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone ?? null,
          memberType: row.member_type,
          status: row.member_status,
          joinedAt: row.joined_at ?? null,
          expiresAt: row.expires_at,
        }
      : null,
  };
}
