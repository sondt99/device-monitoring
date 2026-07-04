import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDeviceSchema } from '@device-monitoring/shared';
import { buildApp } from '../src/app.js';
import { migrate, openDatabase, type Db } from '../src/db/database.js';
import { bootstrapAdmin } from '../src/auth/bootstrap.js';
import { createDevice } from '../src/devices/repository.js';
import { loginCookie, testConfig } from './helpers.js';

// Regression: the global auth hook must gate on the matched route pattern, not
// the raw request.url. Fastify's router percent-decodes the path before
// matching, so "/%61pi/devices" reaches the /api/devices handler. Matching the
// raw URL let an unauthenticated caller read protected endpoints.
describe('auth gate cannot be bypassed by encoding the path', () => {
  let db: Db;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    await bootstrapAdmin(db, 'admin', 'admin-password-long-enough');
    createDevice(db, createDeviceSchema.parse({ name: 'Secret Router', host: '192.168.1.1' }));
    app = await buildApp(db, testConfig());
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const encodedProtectedPaths = [
    '/%61pi/devices', // %61 = 'a'
    '/%61pi/notification-channels',
    '/%61pi/dashboard/summary',
    '/ap%69/users', // %69 = 'i'
    '/API/../api/devices'
  ];

  it('rejects unauthenticated access to percent-encoded /api paths with 401', async () => {
    for (const url of encodedProtectedPaths) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, `${url} must not leak data`).not.toBe(200);
      expect(res.body).not.toContain('Secret Router');
    }
  });

  it('still routes the canonical /api path through auth (401 unauth, 200 authed)', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/api/devices' });
    expect(unauth.statusCode).toBe(401);

    const cookie = await loginCookie(app, 'admin', 'admin-password-long-enough');
    const authed = await app.inject({ method: 'GET', url: '/api/devices', headers: { cookie } });
    expect(authed.statusCode).toBe(200);
    expect(authed.body).toContain('Secret Router');
  });
});
