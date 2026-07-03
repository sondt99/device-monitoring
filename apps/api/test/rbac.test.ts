import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, openDatabase, type Db } from '../src/db/database.js';
import { bootstrapAdmin } from '../src/auth/bootstrap.js';
import { createUser } from '../src/users/repository.js';
import { loginCookie, testConfig } from './helpers.js';

const ADMIN_PASSWORD = 'admin-password-long-enough';
const VIEWER_PASSWORD = 'viewer-password-long-enough';

describe('role-based access control', () => {
  let db: Db;
  let app: FastifyInstance;
  let adminCookie: string;
  let viewerCookie: string;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    await bootstrapAdmin(db, 'admin', ADMIN_PASSWORD);
    await createUser(db, { username: 'viewer', password: VIEWER_PASSWORD, role: 'viewer' });
    app = await buildApp(db, testConfig());
    await app.ready();
    adminCookie = await loginCookie(app, 'admin', ADMIN_PASSWORD);
    viewerCookie = await loginCookie(app, 'viewer', VIEWER_PASSWORD);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices' });
    expect(res.statusCode).toBe(401);
  });

  it('lets both roles read devices', async () => {
    const asAdmin = await app.inject({ method: 'GET', url: '/api/devices', headers: { cookie: adminCookie } });
    const asViewer = await app.inject({ method: 'GET', url: '/api/devices', headers: { cookie: viewerCookie } });
    expect(asAdmin.statusCode).toBe(200);
    expect(asViewer.statusCode).toBe(200);
  });

  it('blocks viewers from writing devices but allows admins', async () => {
    const payload = { name: 'Router', host: '192.168.1.1' };

    const asViewer = await app.inject({
      method: 'POST',
      url: '/api/devices',
      headers: { cookie: viewerCookie, 'x-device-monitoring-csrf': '1' },
      payload
    });
    expect(asViewer.statusCode).toBe(403);

    const asAdmin = await app.inject({
      method: 'POST',
      url: '/api/devices',
      headers: { cookie: adminCookie, 'x-device-monitoring-csrf': '1' },
      payload
    });
    expect(asAdmin.statusCode).toBe(201);
  });

  it('blocks viewers from writing notification channels', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notification-channels',
      headers: { cookie: viewerCookie, 'x-device-monitoring-csrf': '1' },
      payload: { type: 'webhook', name: 'Ops', enabled: true, config: { url: 'https://example.com' } }
    });
    expect(res.statusCode).toBe(403);
  });

  it('keeps user management admin-only, including reads', async () => {
    const asViewer = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: viewerCookie } });
    expect(asViewer.statusCode).toBe(403);

    const asAdmin = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: adminCookie } });
    expect(asAdmin.statusCode).toBe(200);
    expect(JSON.parse(asAdmin.body).users).toHaveLength(2);
  });

  it('echoes the caller role from /api/auth/me', async () => {
    const asAdmin = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: adminCookie } });
    const asViewer = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: viewerCookie } });
    expect(JSON.parse(asAdmin.body).user.role).toBe('admin');
    expect(JSON.parse(asViewer.body).user.role).toBe('viewer');
  });
});
