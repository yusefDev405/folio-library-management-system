import { env } from '../../config/env.js';
import * as service from './service.js';

export const REFRESH_COOKIE_NAME = 'folio_refresh';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.isProd,
    path: '/api/v1/auth',
    maxAge: env.refreshTokenDays * 24 * 60 * 60 * 1000,
  };
}

export async function login(req, res, next) {
  try {
    const result = await service.login(req.validated.body);
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions());
    res.json({
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  } catch (err) {
    next(err);
  }
}

export function refresh(req, res, next) {
  try {
    const rawCookie = req.cookies?.[REFRESH_COOKIE_NAME];
    const result = service.refresh(rawCookie);
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions());
    res.json({
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  } catch (err) {
    next(err);
  }
}

export function logout(req, res) {
  const rawCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  service.logout(rawCookie);
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.isProd,
    path: '/api/v1/auth',
  });
  res.status(204).send();
}

export function getMe(req, res, next) {
  try {
    const profile = service.getProfile(req.user.id);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    await service.changePassword(req.user.id, req.validated.body);
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.isProd,
      path: '/api/v1/auth',
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
