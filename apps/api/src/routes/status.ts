import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/database.js';
import { mapDevice } from '../db/mappers.js';
import type { DeviceStatus } from '@device-monitoring/shared';

export async function registerStatusRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/status', async () => {
    const rows = db.prepare('SELECT * FROM devices WHERE enabled = 1 ORDER BY name COLLATE NOCASE').all() as Record<string, unknown>[];
    const devices = rows.map((row) => {
      const d = mapDevice(row);
      return {
        name: d.name,
        group: d.group,
        currentStatus: d.currentStatus,
        lastLatencyMs: d.lastLatencyMs,
        lastCheckedAt: d.lastCheckedAt,
        lastOnlineAt: d.lastOnlineAt
      };
    });

    const counts: Record<DeviceStatus, number> = { up: 0, down: 0, unknown: 0 };
    for (const d of devices) counts[d.currentStatus]++;
    const overall: DeviceStatus = counts.down > 0 ? 'down' : counts.unknown > 0 ? 'unknown' : 'up';

    return { overall, counts, devices };
  });
}
