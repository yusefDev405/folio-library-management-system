import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6) return false;
  const [, nStr, rStr, pStr, salt, expectedHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const expected = Buffer.from(expectedHex, 'hex');
  const derived = await scryptAsync(password, salt, expected.length, { N, r, p });
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
