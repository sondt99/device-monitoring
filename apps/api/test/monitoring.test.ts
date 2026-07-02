import { describe, expect, it, vi } from 'vitest';
import { createDevice } from '../src/devices/repository.js';
import { migrate, openDatabase } from '../src/db/database.js';
import { checkDevice } from '../src/monitoring/service.js';

vi.mock('../src/notifications/service.js', () => ({ notifyTransition: vi.fn() }));

describe('monitoring service', () => {
  it('records status transitions as beats', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const device = createDevice(db, { name: 'Router', host: '127.0.0.1', checkType: 'ping' as const, checkUrl: null, checkPort: null, group: null, latencyThresholdMs: null, intervalSeconds: 10, timeoutMs: 500, retries: 0, enabled: true });
    await checkDevice(db, { check: async () => ({ status: 'up', latencyMs: 12, error: null }) }, device);
    const row = db.prepare('SELECT COUNT(*) AS count FROM beats').get() as { count: number };
    expect(row.count).toBe(1);
    db.close();
  });
});
