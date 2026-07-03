import { createDeviceSchema } from '@device-monitoring/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, openDatabase, type Db } from '../src/db/database.js';
import { createDevice } from '../src/devices/repository.js';
import { testConfig } from './helpers.js';

describe('/metrics', () => {
  let db: Db;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  it('is not exposed when the metrics feature flag is off', async () => {
    const app = await buildApp(db, testConfig({ ENABLE_METRICS: false }));
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('serves Prometheus text format with no token configured', async () => {
    const app = await buildApp(db, testConfig({ ENABLE_METRICS: true }));
    const res = await app.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toMatch(/^# HELP device_monitoring_devices_total/);
    expect(res.body).toContain('device_monitoring_devices_total{status="up"} 0');
    expect(res.body).toContain('device_monitoring_notification_events_total{success="true"} 0');
    await app.close();
  });

  it('reflects actual device state in the exposed gauges', async () => {
    const up = createDevice(db, createDeviceSchema.parse({ name: 'Up device', host: '10.0.0.1' }));
    db.prepare(`UPDATE devices SET current_status = 'up', last_latency_ms = 42 WHERE id = ?`).run(up.id);
    const down = createDevice(db, createDeviceSchema.parse({ name: 'Down device', host: '10.0.0.2' }));
    db.prepare(`UPDATE devices SET current_status = 'down' WHERE id = ?`).run(down.id);

    const app = await buildApp(db, testConfig({ ENABLE_METRICS: true }));
    const res = await app.inject({ method: 'GET', url: '/metrics' });

    expect(res.body).toContain('device_monitoring_devices_total{status="up"} 1');
    expect(res.body).toContain('device_monitoring_devices_total{status="down"} 1');
    expect(res.body).toContain(`device_monitoring_device_up{id="${up.id}",device="Up device"} 1`);
    expect(res.body).toContain(`device_monitoring_device_up{id="${down.id}",device="Down device"} 0`);
    expect(res.body).toContain(`device_monitoring_device_latency_ms{id="${up.id}",device="Up device"} 42`);
    await app.close();
  });

  it('requires a matching bearer token when METRICS_TOKEN is configured', async () => {
    const app = await buildApp(db, testConfig({ ENABLE_METRICS: true, METRICS_TOKEN: 'super-secret' }));

    const noAuth = await app.inject({ method: 'GET', url: '/metrics' });
    expect(noAuth.statusCode).toBe(401);

    const wrongAuth = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer wrong' } });
    expect(wrongAuth.statusCode).toBe(401);

    const correctAuth = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer super-secret' } });
    expect(correctAuth.statusCode).toBe(200);

    await app.close();
  });
});
