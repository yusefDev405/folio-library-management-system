import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');

function loadEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const dbPath = process.env.DB_PATH
    ? path.resolve(ROOT_DIR, process.env.DB_PATH)
    : path.resolve(ROOT_DIR, 'data', 'library.db');
  const jwtSecret =
    process.env.JWT_SECRET ||
    (nodeEnv === 'production'
      ? ''
      : 'dev-only-folio-library-jwt-secret-change-in-production-32chars');

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }

  return {
    nodeEnv,
    isProd: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: Number.isFinite(port) ? port : 3000,
    dbPath,
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshTokenDays: Number.parseInt(process.env.REFRESH_TOKEN_DAYS || '7', 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    backupRetention: Number.parseInt(process.env.BACKUP_RETENTION || '5', 10),
    holdExpiryIntervalMs: Number.parseInt(process.env.HOLD_EXPIRY_INTERVAL_MS || '3600000', 10),
  };
}

export const env = loadEnv();
