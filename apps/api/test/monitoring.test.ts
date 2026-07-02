import { describe, expect, it, vi } from 'vitest';
import type { CreateDeviceInput } from '@device-monitoring/shared';
import { createDevice, getDevice, getUptimeReport } from '../src/devices/repository.js';
import { migrate, openDatabase } from '../src/db/database.js';
import { checkDevice } from '../src/monitoring/service.js';
import { notifyTransition } from '../src/notifications/service.js';

vi.mock('../src/notifications/service.js', () => ({ notifyTransition: vi.fn() }));

const baseInput: CreateDeviceInput = {
  name: 'Router',
  host: '127.0.0.1',
  checkType: 'ping',
  checkUrl: null,
  checkPort: null,
  group: null,
  latencyThresholdMs: null,
  intervalSeconds: 10,
  timeoutMs: 500,
  retries: 0,
  enabled: true
};

describe('monitoring service', () => {
  it('records status transitions as beats', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 12, error: null }) }, device);
    const row = db.prepare('SELECT COUNT(*) AS count FROM beats').get() as { count: number };
    expect(row.count).toBe(1);
    db.close();
  });

  it('marks device degraded when latency exceeds threshold, beat stays up', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, { ...baseInput, latencyThresholdMs: 100 });
    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 250, error: null }) }, device);

    const updated = getDevice(db, device.id);
    expect(updated?.currentStatus).toBe('degraded');

    const beat = db.prepare('SELECT status FROM beats WHERE device_id = ?').get(device.id) as { status: string };
    expect(beat.status).toBe('up');

    expect(notifyTransition).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        previousStatus: 'unknown',
        currentStatus: 'degraded',
        error: 'Latency 250ms exceeds threshold 100ms'
      })
    );
    db.close();
  });

  it('recovers from degraded back to up and notifies', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, { ...baseInput, latencyThresholdMs: 100 });
    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 250, error: null }) }, device);
    const degraded = getDevice(db, device.id);
    expect(degraded?.currentStatus).toBe('degraded');

    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 20, error: null }) }, degraded!);
    expect(getDevice(db, device.id)?.currentStatus).toBe('up');
    db.close();
  });

  it('does not notify when status is unchanged', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    vi.mocked(notifyTransition).mockClear();
    const device = createDevice(db, baseInput);
    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 10, error: null }) }, device);
    const afterFirst = getDevice(db, device.id)!;
    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 11, error: null }) }, afterFirst);
    expect(notifyTransition).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('aggregates daily uptime from beats', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    const today = new Date().toISOString();
    const insert = db.prepare('INSERT INTO beats (device_id, checked_at, status, latency_ms, error) VALUES (?, ?, ?, ?, ?)');
    insert.run(device.id, today, 'up', 10, null);
    insert.run(device.id, today, 'up', 12, null);
    insert.run(device.id, today, 'down', null, 'timeout');
    insert.run(device.id, today, 'down', null, 'timeout');

    const report = getUptimeReport(db, device.id, 7);
    expect(report).toHaveLength(1);
    expect(report[0].total).toBe(4);
    expect(report[0].up).toBe(2);
    expect(report[0].uptimePct).toBe(50);
    db.close();
  });
});
