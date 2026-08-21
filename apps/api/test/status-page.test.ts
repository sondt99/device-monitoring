import type { FastifyInstance } from 'fastify';
import { createDeviceSchema } from '@device-monitoring/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, openDatabase, type Db } from '../src/db/database.js';
import { bootstrapAdmin } from '../src/auth/bootstrap.js';
import { createDevice } from '../src/devices/repository.js';
import { loginCookie, testConfig } from './helpers.js';

const ADMIN_PASSWORD = 'admin-password-long-enough';

describe('public status page', () => {
  let db: Db;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  it('is not reachable without auth when the status page feature flag is off', async () => {
    const app = await buildApp(db, testConfig({ ENABLE_STATUS_PAGE: false }));
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    // The route isn't registered at all, but it's also not on the public
    // allow-list while the flag is off, so the global auth hook still
    // gates it — a request without a session gets 401, same as any other
    // unknown /api/* path, rather than confirming the route's existence.
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // The nav link is rendered from this flag, so if /api/auth/me stops
  // reporting it the UI silently goes back to advertising a dead end.
  it.each([true, false])('reports statusPage=%s on /api/auth/me', async (enabled) => {
    await bootstrapAdmin(db, 'admin', ADMIN_PASSWORD);
    const app = await buildApp(db, testConfig({ ENABLE_STATUS_PAGE: enabled }));
    await app.ready();
    const cookie = await loginCookie(app, 'admin', ADMIN_PASSWORD);

    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { features: { statusPage: boolean } };
    expect(body.features.statusPage).toBe(enabled);
    await app.close();
  });

  it('is secure by default: a device created with only required fields is not public', () => {
    const device = createDevice(db, createDeviceSchema.parse({ name: 'NAS', host: '10.0.0.5' }));
    expect(device.isPublic).toBe(false);
  });

  it('only lists enabled + explicitly public devices, without requiring authentication', async () => {
    createDevice(db, createDeviceSchema.parse({ name: 'Public up', host: '10.0.0.1', isPublic: true }));
    createDevice(db, createDeviceSchema.parse({ name: 'Private', host: '10.0.0.2', isPublic: false }));
    createDevice(db, createDeviceSchema.parse({ name: 'Public but disabled', host: '10.0.0.3', isPublic: true, enabled: false }));

    const app: FastifyInstance = await buildApp(db, testConfig({ ENABLE_STATUS_PAGE: true }));
    const res = await app.inject({ method: 'GET', url: '/api/status' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { devices: { name: string }[] };
    expect(body.devices.map((d) => d.name)).toEqual(['Public up']);
    await app.close();
  });
});
