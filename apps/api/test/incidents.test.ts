import type { CreateDeviceInput } from '@device-monitoring/shared';
import { describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '../src/db/database.js';
import { createDevice, getIncidentTimeline } from '../src/devices/repository.js';

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

function insertBeats(db: Db, deviceId: number, beats: { at: string; status: 'up' | 'down' }[]) {
  const insert = db.prepare('INSERT INTO beats (device_id, checked_at, status, latency_ms, error) VALUES (?, ?, ?, NULL, NULL)');
  for (const beat of beats) insert.run(deviceId, beat.at, beat.status);
}

describe('incident timeline', () => {
  it('groups a contiguous run of down beats into a single incident', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    insertBeats(db, device.id, [
      { at: '2026-01-01T00:00:00.000Z', status: 'up' },
      { at: '2026-01-01T00:01:00.000Z', status: 'down' },
      { at: '2026-01-01T00:02:00.000Z', status: 'down' },
      { at: '2026-01-01T00:03:00.000Z', status: 'down' },
      { at: '2026-01-01T00:04:00.000Z', status: 'up' }
    ]);

    const incidents = getIncidentTimeline(db, device.id, 50);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      deviceId: device.id,
      startedAt: '2026-01-01T00:01:00.000Z',
      endedAt: '2026-01-01T00:03:00.000Z',
      beatCount: 3,
      durationSeconds: 120
    });
    db.close();
  });

  it('handles an incident that starts at the very first beat', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    insertBeats(db, device.id, [
      { at: '2026-01-01T00:00:00.000Z', status: 'down' },
      { at: '2026-01-01T00:01:00.000Z', status: 'down' },
      { at: '2026-01-01T00:02:00.000Z', status: 'up' }
    ]);

    const incidents = getIncidentTimeline(db, device.id, 50);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(incidents[0].endedAt).toBe('2026-01-01T00:01:00.000Z');
    db.close();
  });

  it('handles an incident that is still ongoing at the last beat', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    insertBeats(db, device.id, [
      { at: '2026-01-01T00:00:00.000Z', status: 'up' },
      { at: '2026-01-01T00:01:00.000Z', status: 'down' }
    ]);

    const incidents = getIncidentTimeline(db, device.id, 50);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ startedAt: '2026-01-01T00:01:00.000Z', endedAt: '2026-01-01T00:01:00.000Z', beatCount: 1, durationSeconds: 0 });
    db.close();
  });

  it('separates two down runs into two incidents, most recent first', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    insertBeats(db, device.id, [
      { at: '2026-01-01T00:00:00.000Z', status: 'down' },
      { at: '2026-01-01T00:01:00.000Z', status: 'up' },
      { at: '2026-01-01T00:02:00.000Z', status: 'down' },
      { at: '2026-01-01T00:03:00.000Z', status: 'up' }
    ]);

    const incidents = getIncidentTimeline(db, device.id, 50);
    expect(incidents).toHaveLength(2);
    expect(incidents[0].startedAt).toBe('2026-01-01T00:02:00.000Z');
    expect(incidents[1].startedAt).toBe('2026-01-01T00:00:00.000Z');
    db.close();
  });

  it('returns no incidents when the device has never gone down', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    insertBeats(db, device.id, [
      { at: '2026-01-01T00:00:00.000Z', status: 'up' },
      { at: '2026-01-01T00:01:00.000Z', status: 'up' }
    ]);

    expect(getIncidentTimeline(db, device.id, 50)).toHaveLength(0);
    db.close();
  });

  it('respects the limit parameter', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, baseInput);
    insertBeats(db, device.id, [
      { at: '2026-01-01T00:00:00.000Z', status: 'down' },
      { at: '2026-01-01T00:01:00.000Z', status: 'up' },
      { at: '2026-01-01T00:02:00.000Z', status: 'down' },
      { at: '2026-01-01T00:03:00.000Z', status: 'up' }
    ]);

    expect(getIncidentTimeline(db, device.id, 1)).toHaveLength(1);
    db.close();
  });
});
