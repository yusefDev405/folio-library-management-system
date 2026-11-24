import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import { getDb } from './config/db.js';
import { env, ROOT_DIR } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { createAdminRouter } from './modules/admin/routes.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createBooksRouter } from './modules/books/routes.js';
import { createCatalogMetaRouter } from './modules/catalogMeta/routes.js';
import { createCopiesRouter } from './modules/copies/routes.js';
import { createEngagementRouter } from './modules/engagement/routes.js';
import { createFinesRouter } from './modules/fines/routes.js';
import { createLoansRouter } from './modules/loans/routes.js';
import { createMembersRouter } from './modules/members/routes.js';
import { createNotificationsRouter } from './modules/notifications/routes.js';
import { createReportsRouter } from './modules/reports/routes.js';
import { createReservationsRouter } from './modules/reservations/routes.js';
import { createSearchRouter } from './modules/search/routes.js';
import { createStocktakeRouter } from './modules/stocktake/routes.js';

export function createApp({ enableRateLimit = !env.isTest } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);

  // Strict CSP for application pages; Swagger UI mounts separately below
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/docs')) {
      return helmet({
        contentSecurityPolicy: false,
      })(req, res, next);
    }
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
    })(req, res, next);
  });

  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  const rateLimitMessage = {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests; please wait a moment and try again.',
    },
  };

  if (enableRateLimit) {
    app.use(
      '/api/v1',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 600,
        standardHeaders: true,
        legacyHeaders: false,
        message: rateLimitMessage,
      })
    );
  }

  const authLimiter = enableRateLimit
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 25,
        standardHeaders: true,
        legacyHeaders: false,
        message: rateLimitMessage,
      })
    : null;

  const searchLimiter = enableRateLimit
    ? rateLimit({
        windowMs: 60 * 1000,
        max: 120,
        standardHeaders: true,
        legacyHeaders: false,
        message: rateLimitMessage,
      })
    : null;

  // Serve Swagger UI at /api/docs
  const openApiPath = path.join(ROOT_DIR, 'docs', 'openapi.yaml');
  if (fs.existsSync(openApiPath)) {
    const openApiDoc = yaml.load(fs.readFileSync(openApiPath, 'utf8'));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));
  }

  // API v1 routes
  const api = express.Router();

  api.get('/health', (_req, res) => {
    try {
      const row = getDb().prepare('SELECT 1 AS ok').get();
      res.json({
        data: {
          status: row?.ok === 1 ? 'ok' : 'degraded',
          engine: 'sqlite',
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      res.status(503).json({
        error: { code: 'DB_UNAVAILABLE', message: 'Database health check failed.' },
      });
    }
  });

  api.use(createAuthRouter({ authLimiter }));
  api.use(createBooksRouter({ searchLimiter }));
  api.use(createCopiesRouter());
  api.use(createCatalogMetaRouter());
  api.use(createMembersRouter());
  api.use(createLoansRouter());
  api.use(createReservationsRouter());
  api.use(createFinesRouter());
  api.use(createReportsRouter());
  api.use(createAdminRouter());
  api.use(createEngagementRouter());
  api.use(createNotificationsRouter());
  api.use(createStocktakeRouter());
  api.use(createSearchRouter());
  api.use(notFoundHandler);

  app.use('/api/v1', api);

  // Serve lightweight static frontend
  const frontendDir = path.join(ROOT_DIR, 'frontend');
  if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
