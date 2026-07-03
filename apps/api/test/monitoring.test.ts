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
  tlsExpiryWarnDays: null,
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

  it('marks a TLS device degraded when the certificate is expiring soon', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, { ...baseInput, checkType: 'tls', checkPort: 443, tlsExpiryWarnDays: 14 });
    await checkDevice(
      db,
      { check: async () => ({ status: 'up', latencyMs: 30, error: null, meta: { daysUntilExpiry: 5 } }) },
      device
    );

    expect(getDevice(db, device.id)?.currentStatus).toBe('degraded');
    expect(notifyTransition).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ currentStatus: 'degraded', error: 'TLS certificate expires in 5 day(s)' })
    );
    db.close();
  });

  it('keeps a TLS device up when the certificate is not near expiry', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, { ...baseInput, checkType: 'tls', checkPort: 443, tlsExpiryWarnDays: 14 });
    await checkDevice(
      db,
      { check: async () => ({ status: 'up', latencyMs: 30, error: null, meta: { daysUntilExpiry: 90 } }) },
      device
    );

    expect(getDevice(db, device.id)?.currentStatus).toBe('up');
    db.close();
  });

  it('defaults the TLS expiry warning threshold to 14 days when unset', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, { ...baseInput, checkType: 'tls', checkPort: 443, tlsExpiryWarnDays: null });
    await checkDevice(
      db,
      { check: async () => ({ status: 'up', latencyMs: 30, error: null, meta: { daysUntilExpiry: 10 } }) },
      device
    );

    expect(getDevice(db, device.id)?.currentStatus).toBe('degraded');
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

describe('down confirmation (anti-flap)', () => {
  const FAST_CONFIRM = { attempts: 3, delayMs: 0 };

  async function upDevice(db: ReturnType<typeof openDatabase>) {
    const device = createDevice(db, baseInput);
    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 5, error: null }) }, device);
    return getDevice(db, device.id)!;
  }

  it('does not mark an up device down on a transient blip', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    vi.mocked(notifyTransition).mockClear();
    const device = await upDevice(db);

    let calls = 0;
    const flaky = {
      check: async () => {
        calls += 1;
        return calls === 1
          ? { status: 'down' as const, latencyMs: null, error: 'blip' }
          : { status: 'up' as const, latencyMs: 8, error: null };
      }
    };
    await checkDevice(db, flaky, device, FAST_CONFIRM);

    expect(calls).toBe(2); // primary check + one silent confirmation that succeeded
    expect(getDevice(db, device.id)?.currentStatus).toBe('up');
    const lastBeat = db.prepare('SELECT status FROM beats WHERE device_id = ? ORDER BY id DESC LIMIT 1').get(device.id) as { status: string };
    expect(lastBeat.status).toBe('up');
    // Only the initial unknown->up notification, nothing for the blip.
    expect(notifyTransition).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('marks down and notifies only after every confirmation fails', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    vi.mocked(notifyTransition).mockClear();
    const device = await upDevice(db);

    let calls = 0;
    const dead = {
      check: async () => {
        calls += 1;
        return { status: 'down' as const, latencyMs: null, error: 'timeout' };
      }
    };
    await checkDevice(db, dead, device, FAST_CONFIRM);

    expect(calls).toBe(4); // primary check + 3 confirmations
    expect(getDevice(db, device.id)?.currentStatus).toBe('down');
    expect(notifyTransition).toHaveBeenCalledTimes(2); // unknown->up, then up->down
    expect(notifyTransition).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({ previousStatus: 'up', currentStatus: 'down' })
    );
    // The silent confirmation probes must not create extra beats.
    const beatCount = (db.prepare('SELECT COUNT(*) AS c FROM beats WHERE device_id = ?').get(device.id) as { c: number }).c;
    expect(beatCount).toBe(2);
    db.close();
  });

  it('skips confirmations entirely when the device is already down', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    await checkDevice(db, { check: async () => ({ status: 'down', latencyMs: null, error: 'timeout' }) }, device, { attempts: 0, delayMs: 0 });
    const downDevice = getDevice(db, device.id)!;
    expect(downDevice.currentStatus).toBe('down');

    let calls = 0;
    const dead = {
      check: async () => {
        calls += 1;
        return { status: 'down' as const, latencyMs: null, error: 'timeout' };
      }
    };
    await checkDevice(db, dead, downDevice, FAST_CONFIRM);

    expect(calls).toBe(1); // no re-checks: the outage is already known
    db.close();
  });

  it('confirms before the very first known state too (unknown -> down)', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    vi.mocked(notifyTransition).mockClear();
    const device = createDevice(db, baseInput);

    let calls = 0;
    const flaky = {
      check: async () => {
        calls += 1;
        return calls === 1
          ? { status: 'down' as const, latencyMs: null, error: 'blip' }
          : { status: 'up' as const, latencyMs: 8, error: null };
      }
    };
    await checkDevice(db, flaky, device, FAST_CONFIRM);

    expect(getDevice(db, device.id)?.currentStatus).toBe('up');
    expect(notifyTransition).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ previousStatus: 'unknown', currentStatus: 'up' })
    );
    db.close();
  });
});
