import crypto from 'node:crypto';
import { logEvent } from '../utils/logger.js';

export function requestIdMiddleware(req, res, next) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    logEvent('info', 'http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id ?? null,
    });
  });

  next();
}
