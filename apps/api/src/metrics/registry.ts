import type { Db } from '../db/database.js';

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

export function renderMetrics(db: Db): string {
  const lines: string[] = [];

  const statusRows = db.prepare('SELECT current_status, COUNT(*) AS count FROM devices GROUP BY current_status').all() as {
    current_status: string;
    count: number;
  }[];
  const countsByStatus: Record<string, number> = { up: 0, degraded: 0, down: 0, unknown: 0 };
  for (const row of statusRows) countsByStatus[row.current_status] = row.count;

  lines.push('# HELP device_monitoring_devices_total Number of devices by current status.');
  lines.push('# TYPE device_monitoring_devices_total gauge');
  for (const [status, count] of Object.entries(countsByStatus)) {
    lines.push(`device_monitoring_devices_total{status="${status}"} ${count}`);
  }

  const devices = db.prepare('SELECT id, name, current_status, last_latency_ms FROM devices').all() as {
    id: number;
    name: string;
    current_status: string;
    last_latency_ms: number | null;
  }[];

  lines.push('# HELP device_monitoring_device_up Whether a device is currently reachable (1) or not (0); degraded counts as reachable.');
  lines.push('# TYPE device_monitoring_device_up gauge');
  for (const device of devices) {
    const up = device.current_status === 'up' || device.current_status === 'degraded' ? 1 : 0;
    lines.push(`device_monitoring_device_up{id="${device.id}",device="${escapeLabelValue(device.name)}"} ${up}`);
  }

  lines.push('# HELP device_monitoring_device_latency_ms Last observed check latency in milliseconds.');
  lines.push('# TYPE device_monitoring_device_latency_ms gauge');
  for (const device of devices) {
    if (device.last_latency_ms === null) continue;
    lines.push(`device_monitoring_device_latency_ms{id="${device.id}",device="${escapeLabelValue(device.name)}"} ${device.last_latency_ms}`);
  }

  const eventRows = db.prepare('SELECT success, COUNT(*) AS count FROM notification_events GROUP BY success').all() as {
    success: number;
    count: number;
  }[];
  const eventsBySuccess: Record<'true' | 'false', number> = { true: 0, false: 0 };
  for (const row of eventRows) eventsBySuccess[row.success === 1 ? 'true' : 'false'] = row.count;

  lines.push('# HELP device_monitoring_notification_events_total Notification delivery attempts by outcome.');
  lines.push('# TYPE device_monitoring_notification_events_total gauge');
  for (const [success, count] of Object.entries(eventsBySuccess)) {
    lines.push(`device_monitoring_notification_events_total{success="${success}"} ${count}`);
  }

  return lines.join('\n') + '\n';
}
