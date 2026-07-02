import type { CreateDeviceInput, Device, UpdateDeviceInput } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { mapBeat, mapDevice } from '../db/mappers.js';

export function listDevices(db: Db): Device[] {
  return db.prepare('SELECT * FROM devices ORDER BY name COLLATE NOCASE').all().map((row) => mapDevice(row as Record<string, unknown>));
}

export function getDevice(db: Db, id: number): Device | null {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapDevice(row) : null;
}

export function createDevice(db: Db, input: CreateDeviceInput): Device {
  const result = db
    .prepare(
      `INSERT INTO devices (name, host, check_type, check_url, check_port, "group", interval_seconds, timeout_ms, retries, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(input.name, input.host, input.checkType, input.checkUrl, input.checkPort, input.group, input.intervalSeconds, input.timeoutMs, input.retries, input.enabled ? 1 : 0);
  return getDevice(db, Number(result.lastInsertRowid)) as Device;
}

export function updateDevice(db: Db, id: number, input: UpdateDeviceInput): Device | null {
  const current = getDevice(db, id);
  if (!current) return null;
  const next = { ...current, ...input };
  db.prepare(
    `UPDATE devices
     SET name = ?, host = ?, check_type = ?, check_url = ?, check_port = ?, "group" = ?,
         interval_seconds = ?, timeout_ms = ?, retries = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    next.name,
    next.host,
    next.checkType,
    next.checkUrl,
    next.checkPort,
    next.group,
    next.intervalSeconds,
    next.timeoutMs,
    next.retries,
    next.enabled ? 1 : 0,
    new Date().toISOString(),
    id
  );
  return getDevice(db, id);
}

export function deleteDevice(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes > 0;
}

export function listBeats(db: Db, deviceId: number, limit = 200) {
  return db
    .prepare('SELECT * FROM beats WHERE device_id = ? ORDER BY checked_at DESC LIMIT ?')
    .all(deviceId, limit)
    .map((row) => mapBeat(row as Record<string, unknown>));
}

export interface DailyUptime {
  date: string;
  total: number;
  up: number;
  uptimePct: number;
}

export function getUptimeReport(db: Db, deviceId: number, days: number): DailyUptime[] {
  const rows = db
    .prepare(
      `SELECT date(checked_at) AS day,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up_count
       FROM beats
       WHERE device_id = ? AND checked_at >= date('now', ?)
       GROUP BY day
       ORDER BY day`
    )
    .all(deviceId, `-${days} days`) as { day: string; total: number; up_count: number }[];

  return rows.map((r) => ({
    date: r.day,
    total: r.total,
    up: r.up_count,
    uptimePct: r.total > 0 ? Math.round((r.up_count / r.total) * 1000) / 10 : 0
  }));
}
