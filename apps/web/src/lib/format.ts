import type { Beat } from '@device-monitoring/shared';

export const statusTone: Record<string, { label: string; hint: string }> = {
  up: { label: 'Online', hint: 'Responding normally' },
  degraded: { label: 'Degraded', hint: 'High latency detected' },
  down: { label: 'Offline', hint: 'Needs attention' },
  unknown: { label: 'Unknown', hint: 'Waiting for first beat' }
};

export function formatDateTime(value?: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function formatDateTimeFull(value?: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export function timeAgo(value?: string | null): string {
  if (!value) return 'Never';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatLatency(value?: number | null): string {
  return value === null || value === undefined ? '—' : `${value}ms`;
}

export interface BeatStats {
  uptimePct: number | null;
  avg: number | null;
  min: number | null;
  p95: number | null;
}

export function calcStats(beats: Beat[]): BeatStats {
  if (beats.length === 0) return { uptimePct: null, avg: null, min: null, p95: null };
  const up = beats.filter((b) => b.status === 'up');
  const uptimePct = Math.round((up.length / beats.length) * 1000) / 10;
  const latencies = up.map((b) => b.latencyMs).filter((l): l is number => l !== null);
  if (latencies.length === 0) return { uptimePct, avg: null, min: null, p95: null };
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const min = Math.min(...latencies);
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { uptimePct, avg, min, p95 };
}

export function deriveHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
