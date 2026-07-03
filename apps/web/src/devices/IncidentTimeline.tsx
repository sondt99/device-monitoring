import { useQuery } from '@tanstack/react-query';
import { EmptyState, LoadingBlock } from '../components/index.js';
import { durationLabel, formatDateTimeFull } from '../lib/format.js';
import { api } from '../api.js';

export function IncidentTimeline({ deviceId }: { deviceId: number }) {
  const incidents = useQuery({
    queryKey: ['incidents', deviceId],
    queryFn: () => api.incidents(deviceId),
    refetchInterval: 30_000
  });

  const list = incidents.data?.incidents ?? [];

  return (
    <div className="uptime-heatmap">
      <span className="heatmap-label">Recent incidents</span>
      {incidents.isLoading ? <LoadingBlock label="Loading incident history…" /> : null}
      {!incidents.isLoading && list.length === 0 ? (
        <EmptyState title="No incidents recorded" description="This device has not gone down since beat history began." />
      ) : null}
      {list.length > 0 ? (
        <ul className="incident-list">
          {list.map((incident) => (
            <li key={`${incident.startedAt}-${incident.endedAt}`}>
              <strong>{formatDateTimeFull(incident.startedAt)}</strong>
              <span>
                Down for {durationLabel(incident.durationSeconds)} · {incident.beatCount} failed beat{incident.beatCount === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
