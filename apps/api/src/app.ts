import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import type { Db } from './db/database.js';
import { requireAuth } from './auth/sessions.js';
import { HttpError } from './errors.js';
import { renderMetrics } from './metrics/registry.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerMaintenanceRoutes } from './routes/maintenance.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerUserRoutes } from './routes/users.js';

// Timing-safe string comparison. Hashing first fixes both inputs to 32 bytes
// so timingSafeEqual never sees a length mismatch (which would itself leak the
// secret's length) and can't early-exit on the first differing byte.
function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return timingSafeEqual(ah, bh);
}

export async function buildApp(db: Db, config: AppConfig) {
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'test' ? 'silent' : 'info' },
    trustProxy: config.trustProxy
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation failed', details: error.flatten() });
      return;
    }
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }
    // Framework/plugin client errors (rate-limit 429, payload-too-large 413,
    // malformed JSON 400, ...) carry a statusCode. Preserve genuine 4xx codes
    // instead of masking them as 500 — otherwise the login brute-force limiter
    // would report "Internal server error" on throttle. 5xx stay masked so we
    // never leak internal failure details.
    const err = error as { statusCode?: number; message?: string };
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      reply.code(err.statusCode).send({ error: err.message ?? 'Request failed' });
      return;
    }
    app.log.error(error);
    reply.code(500).send({ error: 'Internal server error' });
  });

  // Defence-in-depth against XSS/clickjacking. The SPA is fully self-hosted:
  // its built index.html references only external, same-origin JS/CSS (no
  // inline <script>), and it talks only to same-origin /api. So we can lock
  // script/connect down to 'self'. React applies runtime style="" attributes,
  // hence 'unsafe-inline' on style-src only (never script-src). We do NOT set
  // upgrade-insecure-requests: the app is routinely reached over plain HTTP on
  // a LAN, and forcing an https upgrade would break subresource loading there.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"]
      }
    }
  });
  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  const publicApiRoutes = new Set(['/api/auth/login', ...(config.ENABLE_STATUS_PAGE ? ['/api/status'] : [])]);

  app.get('/healthz', async () => ({ ok: true }));
  await registerAuthRoutes(app, db, config.SECURE_COOKIES);
  if (config.ENABLE_STATUS_PAGE) await registerStatusRoutes(app, db);

  if (config.ENABLE_METRICS) {
    const expectedAuth = config.METRICS_TOKEN ? `Bearer ${config.METRICS_TOKEN}` : null;
    app.get('/metrics', async (request, reply) => {
      // Scrapers carry no session cookie, so this is gated by an optional
      // bearer token instead of the cookie-based auth used everywhere else.
      // Compare in constant time (SHA-256 then timingSafeEqual) so the token
      // can't be recovered byte-by-byte via a response-timing side channel.
      if (expectedAuth && !constantTimeEqual(request.headers.authorization ?? '', expectedAuth)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
      return renderMetrics(db);
    });
  }

  // Decide the auth/CSRF gate on a canonical path, NEVER the raw request.url.
  // Fastify's router percent-decodes the path before matching, so a request to
  // "/%61pi/devices" reaches the /api/devices handler while request.url still
  // reads "/%61pi/devices" — matching the raw URL there let an unauthenticated
  // caller slip past these hooks entirely.
  //   - Matched route  -> routeOptions.url, the registered pattern (e.g.
  //     "/api/devices/:id"): authoritative and immune to encoding/query tricks.
  //   - Unmatched (404) -> the decoded request path, so an unknown /api/* path
  //     is still gated to 401 (never 404) and doesn't confirm which routes
  //     exist. No handler runs for these, so there is nothing to leak either way.
  const gatePath = (request: FastifyRequest): string => {
    const routeUrl = request.routeOptions.url;
    if (routeUrl) return routeUrl;
    const rawPath = (request.raw.url ?? '').split('?')[0];
    try {
      return decodeURIComponent(rawPath);
    } catch {
      return rawPath;
    }
  };
  const requiresApiGate = (request: FastifyRequest): boolean => {
    const path = gatePath(request);
    return path.startsWith('/api/') && !publicApiRoutes.has(path);
  };

  app.addHook('preHandler', async (request, reply) => {
    if (!requiresApiGate(request)) return;
    await requireAuth(db)(request, reply);
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
    if (!requiresApiGate(request)) return;
    if (request.headers['x-device-monitoring-csrf'] !== '1') {
      return reply.code(403).send({ error: 'Missing CSRF header' });
    }
  });

  await registerDashboardRoutes(app, db);
  await registerDeviceRoutes(app, db);
  await registerNotificationRoutes(app, db);
  await registerUserRoutes(app, db);
  await registerMaintenanceRoutes(app, db);

  if (existsSync(config.staticDir)) {
    await app.register(staticPlugin, { root: config.staticDir, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
