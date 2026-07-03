import type { Device, DeviceStatus } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { mapDevice } from '../db/mappers.js';
import { isDeviceInMaintenanceWindow } from '../maintenance/repository.js';
import { notifyTransition } from '../notifications/service.js';
import type { CheckResult, DeviceChecker } from './checker.js';

export function recordCheck(db: Db, device: Device, result: CheckResult, deviceStatus?: DeviceStatus): { previousStatus: DeviceStatus; currentStatus: DeviceStatus } {
  const checkedAt = new Date().toISOString();
  const previousStatus = device.currentStatus;
  const currentStatus = deviceStatus ?? result.status;
  db.transaction(() => {
    db.prepare('INSERT INTO beats (device_id, checked_at, status, latency_ms, error) VALUES (?, ?, ?, ?, ?)').run(
      device.id,
      checkedAt,
      result.status,
      result.latencyMs,
      result.error
    );
    db.prepare(
      `UPDATE devices
       SET current_status    = ?,
           last_latency_ms   = ?,
           last_checked_at   = ?,
           last_online_at    = CASE WHEN ? = 'up' THEN ? ELSE last_online_at END,
           updated_at        = ?
       WHERE id = ?`
    ).run(currentStatus, result.latencyMs, checkedAt, result.status, checkedAt, checkedAt, device.id);
  })();
  return { previousStatus, currentStatus };
}

type DegradationInputs = Pick<Device, 'checkType' | 'latencyThresholdMs' | 'tlsExpiryWarnDays'>;

function degradedReason(result: CheckResult, device: DegradationInputs): string | null {
  if (device.checkType === 'tls' && result.meta?.daysUntilExpiry !== undefined) {
    const warnDays = device.tlsExpiryWarnDays ?? 14;
    if (result.meta.daysUntilExpiry <= warnDays) return `TLS certificate expires in ${result.meta.daysUntilExpiry} day(s)`;
  }
  if (device.latencyThresholdMs && result.latencyMs !== null && result.latencyMs > device.latencyThresholdMs) {
    return `Latency ${result.latencyMs}ms exceeds threshold ${device.latencyThresholdMs}ms`;
  }
  return null;
}

function resolveStatus(result: CheckResult, device: DegradationInputs): DeviceStatus {
  if (result.status === 'down') return 'down';
  return degradedReason(result, device) ? 'degraded' : 'up';
}

const DOWN_CONFIRMATION_ATTEMPTS = 3;
const DOWN_CONFIRMATION_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DownConfirmation {
  attempts: number;
  delayMs: number;
}

export async function checkDevice(
  db: Db,
  checker: DeviceChecker,
  device: Device,
  confirm: DownConfirmation = { attempts: DOWN_CONFIRMATION_ATTEMPTS, delayMs: DOWN_CONFIRMATION_DELAY_MS }
): Promise<void> {
  const target = { host: device.host, checkType: device.checkType, checkUrl: device.checkUrl, checkPort: device.checkPort, timeoutMs: device.timeoutMs, retries: device.retries };
  let result = await checker.check(target);

  // Anti-flap: a device that isn't already down is never marked down from a
  // single failed check. Re-check silently in quick succession (much faster
  // than the regular interval); one success cancels the down verdict, and
  // only if every confirmation also fails do we record/notify the outage.
  // The intermediate probes are not recorded as beats.
  if (result.status === 'down' && device.currentStatus !== 'down' && confirm.attempts > 0) {
    for (let attempt = 0; attempt < confirm.attempts; attempt += 1) {
      if (confirm.delayMs > 0) await sleep(confirm.delayMs);
      const recheck = await checker.check(target);
      result = recheck;
      if (recheck.status === 'up') break;
    }
  }

  const effectiveStatus = resolveStatus(result, device);
  // Beats store the raw reachability outcome (up/down); "degraded" only exists
  // at the device level, derived from latency/TLS-expiry vs threshold. Uptime
  // math stays pure while the dashboard still surfaces slow-or-expiring-soon
  // but reachable devices.
  const transition = recordCheck(db, device, result, effectiveStatus);
  if (transition.previousStatus !== transition.currentStatus) {
    const checkedAt = new Date().toISOString();
    // Beats/uptime are recorded unconditionally above — maintenance only
    // suppresses alert noise, not data collection.
    if (!isDeviceInMaintenanceWindow(db, device.id, checkedAt)) {
      await notifyTransition(db, {
        device: { id: device.id, name: device.name, host: device.host },
        previousStatus: transition.previousStatus,
        currentStatus: transition.currentStatus,
        latencyMs: result.latencyMs,
        error: effectiveStatus === 'degraded' ? degradedReason(result, device) : result.error,
        checkedAt
      });
    }
  }
}

export class MonitoringScheduler {
  private readonly dueAt = new Map<number, number>();
  private readonly inFlight = new Set<number>();
  private timer: NodeJS.Timeout | null = null;
  private nextCleanup = 0;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

  constructor(
    private readonly db: Db,
    private readonly checker: DeviceChecker,
    private readonly retentionDays: number = 30,
    private readonly tickMs = 1000
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    const now = Date.now();

    if (now >= this.nextCleanup) {
      this.nextCleanup = now + MonitoringScheduler.CLEANUP_INTERVAL_MS;
      this.purgeOldData();
    }

    const rows = this.db.prepare('SELECT * FROM devices WHERE enabled = 1').all() as Record<string, unknown>[];
    for (const row of rows) {
      const device = mapDevice(row);
      const due = this.dueAt.get(device.id) ?? 0;
      // Down-confirmation re-checks can outlast short intervals — never let a
      // device's next scheduled check start while the previous one is running.
      if (now < due || this.inFlight.has(device.id)) continue;
      this.dueAt.set(device.id, now + device.intervalSeconds * 1000);
      this.inFlight.add(device.id);
      checkDevice(this.db, this.checker, device)
        .catch((error) => {
          console.error(`Check failed for device ${device.id} (${device.name}):`, error);
        })
        .finally(() => this.inFlight.delete(device.id));
    }
  }

  private purgeOldData(): void {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare('DELETE FROM beats WHERE checked_at < ?').run(cutoff);
    this.db.prepare('DELETE FROM notification_events WHERE created_at < ?').run(cutoff);
  }
}
