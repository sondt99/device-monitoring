import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/database.js';

export async function registerDashboardRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/dashboard/summary', async () => {
    const rows = db.prepare('SELECT current_status, COUNT(*) AS count FROM devices GROUP BY current_status').all() as Array<{
      current_status: string;
      count: number;
    }>;
    const counts = { total: 0, up: 0, degraded: 0, down: 0, unknown: 0 };
    for (const row of rows) {
      const count = Number(row.count);
      counts.total += count;
      if (row.current_status === 'up') counts.up = count;
      if (row.current_status === 'degraded') counts.degraded = count;
      if (row.current_status === 'down') counts.down = count;
      if (row.current_status === 'unknown') counts.unknown = count;
    }
    const recentEvents = db
      .prepare(
        `SELECT devices.id AS deviceId, devices.name AS deviceName, beats.status, beats.checked_at AS checkedAt,
                beats.latency_ms AS latencyMs, beats.error
         FROM beats JOIN devices ON devices.id = beats.device_id
         ORDER BY beats.checked_at DESC LIMIT 20`
      )
      .all()
      .map((row) => {
        const value = row as Record<string, unknown>;
        return {
          deviceId: Number(value.deviceId),
          deviceName: String(value.deviceName),
          status: String(value.status),
          checkedAt: String(value.checkedAt),
          latencyMs: value.latencyMs === null ? null : Number(value.latencyMs),
          error: value.error === null ? null : String(value.error)
        };
      });
    return { ...counts, recentEvents };
  });
}
