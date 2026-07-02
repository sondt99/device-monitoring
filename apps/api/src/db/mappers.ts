import type { Beat, CheckType, Device, DeviceStatus, NotificationChannel, NotificationChannelType, NotificationEvent, User } from '@device-monitoring/shared';

type Row = Record<string, unknown>;

const iso = (value: unknown): string => String(value);
const nullableIso = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const intBool = (value: unknown): boolean => Number(value) === 1;

export function mapUser(row: Row): User {
  return { id: Number(row.id), username: String(row.username), createdAt: iso(row.created_at) };
}

export function mapDevice(row: Row): Device {
  return {
    id: Number(row.id),
    name: String(row.name),
    host: String(row.host),
    intervalSeconds: Number(row.interval_seconds),
    timeoutMs: Number(row.timeout_ms),
    retries: Number(row.retries),
    enabled: intBool(row.enabled),
    checkType: String(row.check_type ?? 'ping') as CheckType,
    checkUrl: nullableIso(row.check_url),
    checkPort: row.check_port === null || row.check_port === undefined ? null : Number(row.check_port),
    currentStatus: String(row.current_status) as DeviceStatus,
    lastLatencyMs: row.last_latency_ms === null ? null : Number(row.last_latency_ms),
    lastCheckedAt: nullableIso(row.last_checked_at),
    lastOnlineAt: nullableIso(row.last_online_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export function mapBeat(row: Row): Beat {
  return {
    id: Number(row.id),
    deviceId: Number(row.device_id),
    checkedAt: iso(row.checked_at),
    status: String(row.status) as 'up' | 'down',
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
    error: row.error === null ? null : String(row.error)
  };
}

export function mapChannel(row: Row, redact = true): NotificationChannel {
  const config = JSON.parse(String(row.config_json)) as Record<string, unknown>;
  return {
    id: Number(row.id),
    type: String(row.type) as NotificationChannelType,
    name: String(row.name),
    enabled: intBool(row.enabled),
    config: redact ? redactSecrets(config) : config,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export function mapEvent(row: Row): NotificationEvent {
  return {
    id: Number(row.id),
    deviceId: Number(row.device_id),
    deviceName: String(row.device_name ?? ''),
    channelId: row.channel_id === null ? null : Number(row.channel_id),
    channelName: row.channel_name === null || row.channel_name === undefined ? null : String(row.channel_name),
    transition: String(row.transition),
    success: intBool(row.success),
    error: row.error === null ? null : String(row.error),
    createdAt: iso(row.created_at)
  };
}

export function redactSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const secretKeys = new Set(['url', 'webhookUrl', 'botToken', 'token', 'secret', 'password']);
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, secretKeys.has(key) ? '********' : value])
  );
}
