import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeviceStatus } from '@device-monitoring/shared';
import { api } from '../api.js';

type StatCard = { key: DeviceStatus | 'total'; label: string; value: number; caption: string };

export function StatCards() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 10_000 });
  const cards: StatCard[] = useMemo(
    () => [
      { key: 'total', label: 'Total', value: summary.data?.total ?? 0, caption: 'Configured devices' },
      { key: 'up', label: 'Online', value: summary.data?.up ?? 0, caption: 'Healthy right now' },
      { key: 'degraded', label: 'Degraded', value: summary.data?.degraded ?? 0, caption: 'High latency' },
      { key: 'down', label: 'Offline', value: summary.data?.down ?? 0, caption: 'Needs attention' },
      { key: 'unknown', label: 'Unknown', value: summary.data?.unknown ?? 0, caption: 'Awaiting first beat' }
    ],
    [summary.data]
  );

  const s = summary.data;
  const fleetSegments =
    s && s.total > 0
      ? ([
          { key: 'up', label: 'Online', count: s.up },
          { key: 'degraded', label: 'Degraded', count: s.degraded },
          { key: 'down', label: 'Offline', count: s.down },
          { key: 'unknown', label: 'Unknown', count: s.unknown }
        ] as const).filter((seg) => seg.count > 0)
      : [];

  return (
    <>
      <div className="stats">
        {cards.map((card) => (
          <div className={`stat card stat-${card.key}`} key={card.key}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.caption}</small>
          </div>
        ))}
      </div>
      {fleetSegments.length > 0 && s ? (
        <div className="fleet-bar card" role="img" aria-label={`Fleet health: ${s.up} of ${s.total} online`}>
          <span className="fleet-label">Fleet health</span>
          <div className="fleet-track">
            {fleetSegments.map((seg) => (
              <span
                key={seg.key}
                className={`fleet-seg fleet-${seg.key}`}
                style={{ width: `${(seg.count / s.total) * 100}%` }}
                title={`${seg.label}: ${seg.count}/${s.total}`}
              />
            ))}
          </div>
          <span className="fleet-readout">
            {Math.round((s.up / s.total) * 100)}% <em>online</em>
          </span>
        </div>
      ) : null}
    </>
  );
}
