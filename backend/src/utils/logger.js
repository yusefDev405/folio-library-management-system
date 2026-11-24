const REDACTED_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'password_hash',
  'token',
  'refreshToken',
  'authorization',
  'cookie',
  'email',
  'phone',
]);

export function redactObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key.toLowerCase()) || REDACTED_KEYS.has(key)) {
      out[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      out[key] = redactObject(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function logEvent(level, message, meta = {}) {
  if (process.env.NODE_ENV === 'test' && level === 'info') return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...redactObject(meta),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}
