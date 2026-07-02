import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src/db/database.js';
import { createDevice } from '../src/devices/repository.js';
import { createChannel, getChannel, listEvents, updateChannel } from '../src/notifications/service.js';
import { clampIntParam } from '../src/routes/params.js';

const deviceInput = {
  name: 'NAS',
  host: '10.0.0.5',
  checkType: 'ping' as const,
  checkUrl: null,
  checkPort: null,
  group: null,
  latencyThresholdMs: null,
  intervalSeconds: 60,
  timeoutMs: 5000,
  retries: 1,
  enabled: true
};

describe('notification events', () => {
  it('lists events joined with device and channel names', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, deviceInput);
    const channel = createChannel(db, { type: 'webhook', name: 'Ops hook', enabled: true, config: { url: 'https://example.com/hook' } });

    db.prepare('INSERT INTO notification_events (device_id, channel_id, transition, success) VALUES (?, ?, ?, 1)').run(
      device.id,
      channel.id,
      'up->down'
    );
    db.prepare('INSERT INTO notification_events (device_id, channel_id, transition, success, error) VALUES (?, ?, ?, 0, ?)').run(
      device.id,
      channel.id,
      'down->up',
      'HTTP 500'
    );

    const events = listEvents(db, 50);
    expect(events).toHaveLength(2);
    expect(events[0].deviceName).toBe('NAS');
    expect(events[0].channelName).toBe('Ops hook');
    expect(events.some((e) => !e.success && e.error === 'HTTP 500')).toBe(true);
    db.close();
  });

  it('keeps events with null channel after channel deletion', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, deviceInput);
    const channel = createChannel(db, { type: 'webhook', name: 'Temp', enabled: true, config: { url: 'https://example.com' } });
    db.prepare('INSERT INTO notification_events (device_id, channel_id, transition, success) VALUES (?, ?, ?, 1)').run(
      device.id,
      channel.id,
      'up->down'
    );
    db.prepare('DELETE FROM notification_channels WHERE id = ?').run(channel.id);

    const events = listEvents(db, 50);
    expect(events).toHaveLength(1);
    expect(events[0].channelId).toBeNull();
    expect(events[0].channelName).toBeNull();
    db.close();
  });
});

describe('updateChannel', () => {
  it('merges partial config, keeping omitted secret keys', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const channel = createChannel(db, {
      type: 'telegram',
      name: 'TG',
      enabled: true,
      config: { botToken: 'secret-token', chatId: '111' }
    });

    updateChannel(db, channel.id, { config: { chatId: '222' } });

    const updated = getChannel(db, channel.id, false);
    expect(updated?.config.botToken).toBe('secret-token');
    expect(updated?.config.chatId).toBe('222');
    db.close();
  });

  it('updates name and enabled without touching config', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const channel = createChannel(db, {
      type: 'discord',
      name: 'Old name',
      enabled: true,
      config: { webhookUrl: 'https://discord.com/api/webhooks/1/abc' }
    });

    updateChannel(db, channel.id, { name: 'New name', enabled: false });

    const updated = getChannel(db, channel.id, false);
    expect(updated?.name).toBe('New name');
    expect(updated?.enabled).toBe(false);
    expect(updated?.config.webhookUrl).toBe('https://discord.com/api/webhooks/1/abc');
    db.close();
  });
});

describe('clampIntParam', () => {
  it('returns fallback for missing or non-numeric input', () => {
    expect(clampIntParam(undefined, 50, 1, 200)).toBe(50);
    expect(clampIntParam('abc', 50, 1, 200)).toBe(50);
  });

  it('clamps to bounds and truncates decimals', () => {
    expect(clampIntParam('9999', 50, 1, 200)).toBe(200);
    expect(clampIntParam('-5', 50, 1, 200)).toBe(1);
    expect(clampIntParam('42.9', 50, 1, 200)).toBe(42);
  });
});
