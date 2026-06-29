import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import type { Db } from './db/database.js';
import { requireAuth } from './auth/sessions.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerNotificationRoutes } from './routes/notifications.js';

export async function buildApp(db: Db, config: AppConfig) {
  const app = Fastify({ logger: { level: config.NODE_ENV === 'test' ? 'silent' : 'info' } });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation failed', details: error.flatten() });
      return;
    }
    app.log.error(error);
    reply.code(500).send({ error: 'Internal server error' });
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: config.COOKIE_SECRET ?? 'development-cookie-secret-change-me-32bytes' });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/healthz', async () => ({ ok: true }));
  await registerAuthRoutes(app, db, config.NODE_ENV === 'production');

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/auth/login') return;
    await requireAuth(db)(request, reply);
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
    if (!request.url.startsWith('/api/') || request.url === '/api/auth/login') return;
    if (request.headers['x-device-monitoring-csrf'] !== '1') {
      await reply.code(403).send({ error: 'Missing CSRF header' });
    }
  });

  await registerDashboardRoutes(app, db);
  await registerDeviceRoutes(app, db);
  await registerNotificationRoutes(app, db);

  if (existsSync(config.staticDir)) {
    await app.register(staticPlugin, { root: config.staticDir, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
