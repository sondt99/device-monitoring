import type { CreateMaintenanceWindowInput, MaintenanceWindow, UpdateMaintenanceWindowInput } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { mapMaintenanceWindow } from '../db/mappers.js';
import { HttpError } from '../errors.js';

export function listMaintenanceWindows(db: Db, deviceId?: number): MaintenanceWindow[] {
  const rows = (
    deviceId
      ? db.prepare('SELECT * FROM maintenance_windows WHERE device_id = ? ORDER BY starts_at DESC').all(deviceId)
      : db.prepare('SELECT * FROM maintenance_windows ORDER BY starts_at DESC').all()
  ) as Record<string, unknown>[];
  return rows.map((row) => mapMaintenanceWindow(row));
}

export function getMaintenanceWindow(db: Db, id: number): MaintenanceWindow | null {
  const row = db.prepare('SELECT * FROM maintenance_windows WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapMaintenanceWindow(row) : null;
}

export function createMaintenanceWindow(db: Db, input: CreateMaintenanceWindowInput, createdBy: number | null): MaintenanceWindow {
  const result = db
    .prepare(
      `INSERT INTO maintenance_windows (device_id, starts_at, ends_at, reason, suppress_notifications, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.deviceId, input.startsAt, input.endsAt, input.reason, input.suppressNotifications ? 1 : 0, createdBy);
  return getMaintenanceWindow(db, Number(result.lastInsertRowid)) as MaintenanceWindow;
}

export function updateMaintenanceWindow(db: Db, id: number, input: UpdateMaintenanceWindowInput): MaintenanceWindow | null {
  const current = getMaintenanceWindow(db, id);
  if (!current) return null;
  const next = { ...current, ...input };
  if (new Date(next.endsAt).getTime() <= new Date(next.startsAt).getTime()) {
    throw new HttpError(400, 'endsAt must be after startsAt');
  }
  db.prepare(
    `UPDATE maintenance_windows SET starts_at = ?, ends_at = ?, reason = ?, suppress_notifications = ?, updated_at = ? WHERE id = ?`
  ).run(next.startsAt, next.endsAt, next.reason, next.suppressNotifications ? 1 : 0, new Date().toISOString(), id);
  return getMaintenanceWindow(db, id);
}

export function deleteMaintenanceWindow(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM maintenance_windows WHERE id = ?').run(id).changes > 0;
}

export function isDeviceInMaintenanceWindow(db: Db, deviceId: number, atIso: string): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM maintenance_windows
       WHERE device_id = ? AND suppress_notifications = 1 AND starts_at <= ? AND ends_at >= ?
       LIMIT 1`
    )
    .get(deviceId, atIso, atIso);
}
