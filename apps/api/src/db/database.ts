import Database from 'better-sqlite3';
import type { Database as DatabaseConnection } from 'better-sqlite3';

export type Db = DatabaseConnection;

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS devices (
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
      check_type TEXT NOT NULL DEFAULT 'ping',
      check_url TEXT,
      check_port INTEGER,
      "group" TEXT,
      latency_threshold_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_devices_enabled ON devices(enabled);

    CREATE TABLE IF NOT EXISTS beats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      checked_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('up','down')),
      latency_ms INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_beats_device_checked ON beats(device_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('discord','telegram','webhook')),
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS notification_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      channel_id INTEGER REFERENCES notification_channels(id) ON DELETE SET NULL,
      transition TEXT NOT NULL,
      success INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      reason TEXT,
      suppress_notifications INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_maintenance_windows_device ON maintenance_windows(device_id, starts_at, ends_at);
  `);

  // ── one-time table rebuild: drop the check_type CHECK constraint ───────
  // Older databases created this table with `CHECK (check_type IN
  // ('ping','http','tcp'))`, which blocks adding new check types (SQLite
  // can't alter a CHECK constraint in place). Zod already validates
  // checkType on every write, so the DB constraint is redundant — remove it
  // once via a table rebuild. The replacement is built under a temporary
  // name and renamed into place (rather than renaming the live `devices`
  // table itself) so `beats`/`notification_events`'s foreign keys, which
  // reference `devices` by name, are never rewritten mid-migration.
  const devicesDdl = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'devices'`).get() as
    | { sql: string }
    | undefined;

  if (devicesDdl?.sql.includes('CHECK (check_type IN')) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE devices_new (
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
          check_type TEXT NOT NULL DEFAULT 'ping',
          check_url TEXT,
          check_port INTEGER,
          "group" TEXT,
          latency_threshold_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
      `);
      // Explicit column list, not SELECT *: a devices table only ever has
      // the old CHECK if it was created by the full shape above, so every
      // one of these columns is guaranteed to already exist.
      db.exec(`
        INSERT INTO devices_new (id, name, host, interval_seconds, timeout_ms, retries, enabled, current_status,
          last_latency_ms, last_checked_at, last_online_at, check_type, check_url, check_port, "group",
          latency_threshold_ms, created_at, updated_at)
        SELECT id, name, host, interval_seconds, timeout_ms, retries, enabled, current_status,
          last_latency_ms, last_checked_at, last_online_at, check_type, check_url, check_port, "group",
          latency_threshold_ms, created_at, updated_at
        FROM devices
      `);
      db.exec(`DROP TABLE devices`);
      db.exec(`ALTER TABLE devices_new RENAME TO devices`); // safe: nothing references "devices_new"
      db.exec(`CREATE INDEX IF NOT EXISTS idx_devices_enabled ON devices(enabled)`);
    })();
    db.pragma('foreign_keys = ON');
  }

  // ── migrations (idempotent: wrapped in try-catch) ───────────────────────
  const addColumn = (sql: string) => { try { db.exec(sql); } catch { /* already exists */ } };

  addColumn(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'`);
  addColumn(`ALTER TABLE devices ADD COLUMN last_online_at TEXT`);
  addColumn(`ALTER TABLE devices ADD COLUMN check_type TEXT NOT NULL DEFAULT 'ping'`);
  addColumn(`ALTER TABLE devices ADD COLUMN check_url TEXT`);
  addColumn(`ALTER TABLE devices ADD COLUMN check_port INTEGER`);
  addColumn(`ALTER TABLE devices ADD COLUMN "group" TEXT`);
  addColumn(`ALTER TABLE devices ADD COLUMN latency_threshold_ms INTEGER`);
  addColumn(`ALTER TABLE devices ADD COLUMN tls_expiry_warn_days INTEGER`);
  addColumn(`ALTER TABLE devices ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`);

  // Backfill last_online_at from existing beats for devices that were
  // online before this column was introduced.
  db.exec(`
    UPDATE devices
    SET last_online_at = (
      SELECT MAX(checked_at) FROM beats
      WHERE beats.device_id = devices.id AND beats.status = 'up'
    )
    WHERE last_online_at IS NULL
  `);
}
