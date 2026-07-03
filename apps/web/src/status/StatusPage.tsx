import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, LoadingBlock, StatusBadge } from '../components/index.js';
import { formatDateTime, formatLatency } from '../lib/format.js';
import { api } from '../api.js';

export function StatusPage() {
  const status = useQuery({ queryKey: ['public-status'], queryFn: api.publicStatus, refetchInterval: 15_000 });

  const overallLabel: Record<string, string> = {
    up: 'All systems operational',
    degraded: 'Some systems experiencing high latency',
    down: 'Some systems are down',
    unknown: 'Checking system status…'
  };

  const grouped = useMemo(() => {
    const devices = status.data?.devices ?? [];
    const map = new Map<string, typeof devices>();
    for (const d of devices) {
      const key = d.group ?? 'Ungrouped';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [status.data]);

  if (status.isLoading) {
    return (
      <main className="status-page">
        <LoadingBlock />
      </main>
    );
  }

  if (status.error) {
    return (
      <main className="status-page">
        <EmptyState title="Status page unavailable" description="The public status page may not be enabled on this instance." />
      </main>
    );
  }

  const overall = status.data?.overall ?? 'unknown';

  return (
    <main className="status-page">
      <header className="status-header">
        <p className="eyebrow">Device Monitoring</p>
        <h1>System status</h1>
      </header>

      <div className={`status-banner status-banner-${overall}`}>
        <span className="badge-dot" />
        {overallLabel[overall] ?? 'Unknown'}
      </div>

      {grouped.map(([groupName, devices]) => (
        <section key={groupName} className="card status-group">
          <h2>{groupName}</h2>
          <ul className="status-device-list">
            {devices.map((d, i) => (
              <li key={`${d.name}-${i}`}>
                <div className="status-device-info">
                  <StatusBadge status={d.currentStatus} />
                  <strong>{d.name}</strong>
                </div>
                <div className="status-device-meta">
                  <span>{formatLatency(d.lastLatencyMs)}</span>
                  <span>{formatDateTime(d.lastCheckedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="status-footer">
        Updated every 15 seconds &middot; Powered by Device Monitoring
      </footer>
    </main>
  );
}
