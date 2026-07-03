import { describe, expect, it } from 'vitest';
import { migrate, openDatabase, type Db } from '../src/db/database.js';

/**
 * Simulates a database created by a version of this app where `devices` was
 * defined with `CHECK (check_type IN ('ping','http','tcp'))` — the shape
 * `migrate()` must detect and rebuild.
 */
function createLegacyDb(): Db {
  const db = openDatabase(':memory:');
  db.exec(`
    CREATE TABLE devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      timeout_ms INTEGER NOT NULL,
      retries INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      current_status TEXT NOT NULL DEFAULT 'unknown' CHECK (current_status IN ('unknown','up','degraded','down')),
      last_latency_ms INTEGER,
      last_checked_at TEXT,
      last_online_at TEXT,
      check_type TEXT NOT NULL DEFAULT 'ping' CHECK (check_type IN ('ping','http','tcp')),
      check_url TEXT,
      check_port INTEGER,
      "group" TEXT,
      latency_threshold_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE beats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      checked_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('up','down')),
      latency_ms INTEGER,
      error TEXT
    );
  `);
  return db;
}

describe('check_type CHECK-constraint migration', () => {
  it('drops the CHECK constraint while preserving data and live FK behavior', () => {
    const db = createLegacyDb();
    const insertDevice = db.prepare(
      `INSERT INTO devices (name, host, interval_seconds, timeout_ms, retries, check_type) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const deviceId = Number(insertDevice.run('Router', '192.168.1.1', 60, 5000, 1, 'ping').lastInsertRowid);
    db.prepare(`INSERT INTO beats (device_id, checked_at, status, latency_ms) VALUES (?, ?, 'up', 12)`).run(
      deviceId,
      '2026-01-01T00:00:00.000Z'
    );

    migrate(db);

    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as Record<string, unknown>;
    expect(device.name).toBe('Router');
    expect(device.check_type).toBe('ping');
    const beatCount = () => (db.prepare('SELECT COUNT(*) AS c FROM beats WHERE device_id = ?').get(deviceId) as { c: number }).c;
    expect(beatCount()).toBe(1);

    expect(() => insertDevice.run('DNS check', 'example.com', 60, 5000, 1, 'dns')).not.toThrow();
    expect(() => insertDevice.run('TLS check', 'example.com', 60, 5000, 1, 'tls')).not.toThrow();

    // Proves beats.device_id's FK still targets the live `devices` table
    // rather than having been silently repointed at a renamed backup table.
    db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
    expect(beatCount()).toBe(0);

    db.close();
  });

  it('is idempotent across repeated migrate() calls', () => {
    const db = createLegacyDb();
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    expect(() => migrate(db)).not.toThrow();

    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'devices'`).get() as { sql: string };
    expect(row.sql).not.toContain('CHECK (check_type IN');
    db.close();
  });

  it('fresh databases never had the CHECK constraint to begin with', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'devices'`).get() as { sql: string };
    expect(row.sql).not.toContain('CHECK (check_type IN');
    db.close();
  });
});
