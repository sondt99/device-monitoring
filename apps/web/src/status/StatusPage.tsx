import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingBlock, SectionHeader, StatusBadge } from '../components/index.js';
import { formatDateTime, formatLatency } from '../lib/format.js';
import { api } from '../api.js';

function HomeLink() {
  return (
    <Link className="status-home-link" to="/">
      ← Dashboard
    </Link>
  );
}

const overallLabel: Record<string, string> = {
  up: 'All systems operational',
  degraded: 'Some systems experiencing high latency',
  down: 'Some systems are down',
  unknown: 'Checking system status…'
};

export function StatusPage() {
  const status = useQuery({ queryKey: ['public-status'], queryFn: api.publicStatus, refetchInterval: 15_000 });
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  // Keyed off status.data rather than the array literal so the memos below
  // don't invalidate on every render while the query is still pending.
  const devices = useMemo(() => status.data?.devices ?? [], [status.data]);

  const groups = useMemo(() => {
    const named = devices.map((d) => d.group).filter((g): g is string => g !== null);
    return [...new Set(named)].sort((a, b) => a.localeCompare(b));
  }, [devices]);

  const visibleDevices = useMemo(
    () => (groupFilter === null ? devices : devices.filter((d) => d.group === groupFilter)),
    [devices, groupFilter]
  );

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
        <HomeLink />
        <EmptyState title="Status page unavailable" description="The public status page may not be enabled on this instance." />
      </main>
    );
  }

  const overall = status.data?.overall ?? 'unknown';

  return (
    <main className="status-page">
      <header className="status-header">
        <div>
          <p className="eyebrow">Device Monitoring</p>
          <h1>System status</h1>
        </div>
        <HomeLink />
      </header>

      {/* With nothing published, every count is zero and the API reports
          "up" — so a banner here would claim all is well while monitoring
          nothing. Show the empty state on its own instead. */}
      {devices.length === 0 ? (
        <EmptyState
          title="No devices published"
          description="Devices appear here once they are marked “Show on public status page”."
        />
      ) : (
        <>
          <div className={`status-banner status-banner-${overall}`}>
            <span className="badge-dot" />
            {overallLabel[overall] ?? 'Unknown'}
          </div>

          <section className="card table-card">
            <SectionHeader
              eyebrow="Inventory"
              title="Devices"
              description="Live status for the devices published on this page."
              action={
                groups.length > 0 ? (
                  <div className="table-actions">
                    <div className="group-filter">
                      <select
                        aria-label="Filter by group"
                        value={groupFilter ?? ''}
                        onChange={(e) => setGroupFilter(e.target.value || null)}
                      >
                        <option value="">All groups</option>
                        {groups.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : undefined
              }
            />

            {visibleDevices.length === 0 ? (
              <EmptyState title="No devices in this group" description="Choose a different group to see its devices." />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Group</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Last check</th>
                      <th>Last online</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Host and Type are intentionally absent: this page is served
                        without authentication, and publishing hostnames or which
                        ports are probed would hand out internal topology. */}
                    {visibleDevices.map((d, i) => (
                      <tr key={`${d.name}-${i}`}>
                        <td>
                          <strong>{d.name}</strong>
                        </td>
                        <td className="muted-mono">{d.group ?? '—'}</td>
                        <td>
                          <StatusBadge status={d.currentStatus} />
                        </td>
                        <td className="mono">{formatLatency(d.lastLatencyMs)}</td>
                        <td className="mono muted-cell">{formatDateTime(d.lastCheckedAt)}</td>
                        <td className="mono muted-cell">{formatDateTime(d.lastOnlineAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <footer className="status-footer">
        Updated every 15 seconds &middot; Powered by{' '}
        <a href="https://github.com/sondt99/device-monitoring" target="_blank" rel="noreferrer">
          Device Monitoring
        </a>
      </footer>
    </main>
  );
}
