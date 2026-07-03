import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DashboardSummary } from '@device-monitoring/shared';
import { DetailRow, EmptyState, LoadingBlock, Modal, SectionHeader, StatusBadge } from '../components/index.js';
import { formatDateTimeFull, formatLatency, timeAgo } from '../lib/format.js';
import { api } from '../api.js';

type RecentEvent = DashboardSummary['recentEvents'][number];

export function RecentBeats() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 10_000 });
  const [selected, setSelected] = useState<RecentEvent | null>(null);

  return (
    <div className="card recent-card">
      <SectionHeader eyebrow="Activity" title="Recent beats" description="Click an entry for full details." />
      {summary.isLoading ? <LoadingBlock label="Loading…" /> : null}
      {!summary.isLoading && summary.data?.recentEvents.length === 0 ? (
        <EmptyState title="No events yet" description="Events appear after the scheduler records checks." />
      ) : null}
      {summary.data && summary.data.recentEvents.length > 0 ? (
        <ul className="event-list">
          {summary.data.recentEvents.map((event) => (
            <li
              key={`${event.deviceId}-${event.checkedAt}`}
              className="clickable"
              role="button"
              tabIndex={0}
              aria-label={`View details for ${event.deviceName}`}
              onClick={() => setSelected(event)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(event);
                }
              }}
            >
              <StatusBadge status={event.status} />
              <div>
                <strong>{event.deviceName}</strong>
                <span title={formatDateTimeFull(event.checkedAt)}>{timeAgo(event.checkedAt)}</span>
              </div>
              <em>{event.error ?? formatLatency(event.latencyMs)}</em>
            </li>
          ))}
        </ul>
      ) : null}

      <Modal open={selected !== null} title="Beat detail" onClose={() => setSelected(null)}>
        {selected ? (
          <div className="detail-rows">
            <DetailRow label="Device">
              <strong>{selected.deviceName}</strong>
            </DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={selected.status} />
            </DetailRow>
            <DetailRow label="Checked at">{formatDateTimeFull(selected.checkedAt)}</DetailRow>
            <DetailRow label="Latency">{formatLatency(selected.latencyMs)}</DetailRow>
            {selected.error ? (
              <DetailRow label="Error">
                <pre className="detail-error">{selected.error}</pre>
              </DetailRow>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
