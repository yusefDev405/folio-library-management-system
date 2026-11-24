import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken({ userId, role, memberId = null }) {
  return jwt.sign(
    {
      sub: String(userId),
      role,
      memberId,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
