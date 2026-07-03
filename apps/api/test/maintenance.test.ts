import type { CreateDeviceInput } from '@device-monitoring/shared';
import { describe, expect, it, vi } from 'vitest';
import { migrate, openDatabase } from '../src/db/database.js';
import { createDevice, getDevice } from '../src/devices/repository.js';
import { HttpError } from '../src/errors.js';
import {
  createMaintenanceWindow,
  deleteMaintenanceWindow,
  isDeviceInMaintenanceWindow,
  listMaintenanceWindows,
  updateMaintenanceWindow
} from '../src/maintenance/repository.js';
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
  isPublic: false,
  intervalSeconds: 10,
  timeoutMs: 500,
  retries: 0,
  enabled: true
};

describe('maintenance windows repository', () => {
  it('creates and lists windows for a device', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);

    createMaintenanceWindow(
      db,
      { deviceId: device.id, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T02:00:00.000Z', reason: 'Firmware upgrade', suppressNotifications: true },
      null
    );

    const windows = listMaintenanceWindows(db, device.id);
    expect(windows).toHaveLength(1);
    expect(windows[0].reason).toBe('Firmware upgrade');
    db.close();
  });

  it('rejects an update that would make endsAt before startsAt', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    const window = createMaintenanceWindow(
      db,
      { deviceId: device.id, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T02:00:00.000Z', reason: null, suppressNotifications: true },
      null
    );

    expect(() => updateMaintenanceWindow(db, window.id, { startsAt: '2026-01-01T03:00:00.000Z' })).toThrow(HttpError);
    db.close();
  });

  it('deletes a window', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    const window = createMaintenanceWindow(
      db,
      { deviceId: device.id, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T02:00:00.000Z', reason: null, suppressNotifications: true },
      null
    );

    expect(deleteMaintenanceWindow(db, window.id)).toBe(true);
    expect(listMaintenanceWindows(db, device.id)).toHaveLength(0);
    db.close();
  });

  describe('isDeviceInMaintenanceWindow', () => {
    it('is true strictly between (inclusive) starts_at and ends_at', () => {
      const db = openDatabase(':memory:');
      migrate(db);
      const device = createDevice(db, baseInput);
      createMaintenanceWindow(
        db,
        { deviceId: device.id, startsAt: '2026-01-01T10:00:00.000Z', endsAt: '2026-01-01T12:00:00.000Z', reason: null, suppressNotifications: true },
        null
      );

      expect(isDeviceInMaintenanceWindow(db, device.id, '2026-01-01T09:59:59.000Z')).toBe(false);
      expect(isDeviceInMaintenanceWindow(db, device.id, '2026-01-01T10:00:00.000Z')).toBe(true);
      expect(isDeviceInMaintenanceWindow(db, device.id, '2026-01-01T11:00:00.000Z')).toBe(true);
      expect(isDeviceInMaintenanceWindow(db, device.id, '2026-01-01T12:00:00.000Z')).toBe(true);
      expect(isDeviceInMaintenanceWindow(db, device.id, '2026-01-01T12:00:01.000Z')).toBe(false);
      db.close();
    });

    it('ignores windows with suppressNotifications disabled', () => {
      const db = openDatabase(':memory:');
      migrate(db);
      const device = createDevice(db, baseInput);
      createMaintenanceWindow(
        db,
        { deviceId: device.id, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T23:59:59.000Z', reason: null, suppressNotifications: false },
        null
      );

      expect(isDeviceInMaintenanceWindow(db, device.id, '2026-01-01T12:00:00.000Z')).toBe(false);
      db.close();
    });
  });
});

describe('maintenance suppression in checkDevice', () => {
  it('suppresses the notification but still records the beat during an active window', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    vi.mocked(notifyTransition).mockClear();
    const device = createDevice(db, baseInput);
    createMaintenanceWindow(
      db,
      { deviceId: device.id, startsAt: '2000-01-01T00:00:00.000Z', endsAt: '2999-01-01T00:00:00.000Z', reason: null, suppressNotifications: true },
      null
    );

    await checkDevice(db, { check: async () => ({ status: 'down', latencyMs: null, error: 'timeout' }) }, device);

    expect(getDevice(db, device.id)?.currentStatus).toBe('down');
    const beatCount = (db.prepare('SELECT COUNT(*) AS c FROM beats WHERE device_id = ?').get(device.id) as { c: number }).c;
    expect(beatCount).toBe(1);
    expect(notifyTransition).not.toHaveBeenCalled();
    db.close();
  });

  it('notifies normally once the window has ended', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    vi.mocked(notifyTransition).mockClear();
    const device = createDevice(db, baseInput);
    createMaintenanceWindow(
      db,
      { deviceId: device.id, startsAt: '2000-01-01T00:00:00.000Z', endsAt: '2000-01-02T00:00:00.000Z', reason: null, suppressNotifications: true },
      null
    );

    await checkDevice(db, { check: async () => ({ status: 'down', latencyMs: null, error: 'timeout' }) }, device);

    expect(notifyTransition).toHaveBeenCalledTimes(1);
    db.close();
  });
});
