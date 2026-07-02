import type { CreateNotificationChannelInput, NotificationChannel, NotificationEvent, UpdateNotificationChannelInput } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { mapChannel, mapEvent } from '../db/mappers.js';
import { providers, type NotificationPayload } from './providers.js';

export function listChannels(db: Db): NotificationChannel[] {
  return db.prepare('SELECT * FROM notification_channels ORDER BY name COLLATE NOCASE').all().map((row) => mapChannel(row as Record<string, unknown>));
}

export function listEvents(db: Db, limit: number): NotificationEvent[] {
  return db
    .prepare(
      `SELECT ne.*, d.name AS device_name, nc.name AS channel_name
       FROM notification_events ne
       LEFT JOIN devices d ON d.id = ne.device_id
       LEFT JOIN notification_channels nc ON nc.id = ne.channel_id
       ORDER BY ne.created_at DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row) => mapEvent(row as Record<string, unknown>));
}

export function getChannel(db: Db, id: number, redact = true): NotificationChannel | null {
  const row = db.prepare('SELECT * FROM notification_channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapChannel(row, redact) : null;
}

export function createChannel(db: Db, input: CreateNotificationChannelInput): NotificationChannel {
  const result = db
    .prepare('INSERT INTO notification_channels (type, name, enabled, config_json) VALUES (?, ?, ?, ?)')
    .run(input.type, input.name, input.enabled ? 1 : 0, JSON.stringify(input.config));
  return getChannel(db, Number(result.lastInsertRowid)) as NotificationChannel;
}

export function updateChannel(db: Db, id: number, input: UpdateNotificationChannelInput): NotificationChannel | null {
  const current = getChannel(db, id, false);
  if (!current) return null;
  const next = { ...current, ...input, config: input.config ?? current.config };
  db.prepare(
    `UPDATE notification_channels SET type = ?, name = ?, enabled = ?, config_json = ?, updated_at = ? WHERE id = ?`
  ).run(next.type, next.name, next.enabled ? 1 : 0, JSON.stringify(next.config), new Date().toISOString(), id);
  return getChannel(db, id);
}

export function deleteChannel(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id).changes > 0;
}

export async function sendToChannel(db: Db, channelId: number, payload: NotificationPayload): Promise<void> {
  const channel = getChannel(db, channelId, false);
  if (!channel) throw new Error('Notification channel not found');
  const provider = providers.get(channel.type);
  if (!provider) throw new Error(`Unsupported notification provider: ${channel.type}`);
  await provider.send(channel.config, payload);
}

export async function notifyTransition(db: Db, payload: NotificationPayload): Promise<void> {
  const rows = db.prepare('SELECT * FROM notification_channels WHERE enabled = 1').all() as Record<string, unknown>[];
  for (const row of rows) {
    const channel = mapChannel(row, false);
    const provider = providers.get(channel.type);
    const transition = `${payload.previousStatus}->${payload.currentStatus}`;
    if (!provider) continue;
    try {
      await provider.send(channel.config, payload);
      db.prepare(
        'INSERT INTO notification_events (device_id, channel_id, transition, success) VALUES (?, ?, ?, 1)'
      ).run(payload.device.id, channel.id, transition);
    } catch (error) {
      db.prepare(
        'INSERT INTO notification_events (device_id, channel_id, transition, success, error) VALUES (?, ?, ?, 0, ?)'
      ).run(payload.device.id, channel.id, transition, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
