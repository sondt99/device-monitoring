import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NotificationEvent } from '@device-monitoring/shared';
import { DetailRow, EmptyState, LoadingBlock, Modal, SectionHeader } from '../components/index.js';
import { formatDateTimeFull, timeAgo } from '../lib/format.js';
import { api } from '../api.js';

export function NotificationHistory() {
  const events = useQuery({ queryKey: ['notification-events'], queryFn: api.notificationEvents, refetchInterval: 30_000 });
  const [selected, setSelected] = useState<NotificationEvent | null>(null);

  const prettyTransition = (t: string) => t.replace('->', ' → ');

  return (
    <div className="card notification-history-card">
      <SectionHeader eyebrow="Delivery log" title="Notification history" description="Click an entry for full delivery details." />
      {events.isLoading ? <LoadingBlock label="Loading…" /> : null}
      {!events.isLoading && events.data?.events.length === 0 ? (
        <EmptyState title="No deliveries yet" description="Notification events appear when device status changes trigger alerts." />
      ) : null}
      {events.data && events.data.events.length > 0 ? (
        <ul className="event-list notification-event-list">
          {events.data.events.map((event: NotificationEvent) => (
            <li
              key={event.id}
              className="clickable"
              role="button"
              tabIndex={0}
              aria-label={`View delivery details for ${event.deviceName || `device ${event.deviceId}`}`}
              onClick={() => setSelected(event)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(event);
                }
              }}
            >
              <span className={`notif-status ${event.success ? 'notif-ok' : 'notif-fail'}`}>
                {event.success ? 'Sent' : 'Failed'}
              </span>
              <div>
                <strong>{event.deviceName || `Device #${event.deviceId}`}</strong>
                <span title={formatDateTimeFull(event.createdAt)}>
                  {event.channelName ?? 'Deleted channel'} &middot; {prettyTransition(event.transition)} &middot; {timeAgo(event.createdAt)}
                </span>
              </div>
              {event.error ? <em className="notif-error">{event.error}</em> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Modal open={selected !== null} title="Delivery detail" onClose={() => setSelected(null)}>
        {selected ? (
          <div className="detail-rows">
            <DetailRow label="Result">
              <span className={`notif-status ${selected.success ? 'notif-ok' : 'notif-fail'}`}>
                {selected.success ? 'Sent' : 'Failed'}
              </span>
            </DetailRow>
            <DetailRow label="Device">
              <strong>{selected.deviceName || `Device #${selected.deviceId}`}</strong>
            </DetailRow>
            <DetailRow label="Channel">{selected.channelName ?? 'Deleted channel'}</DetailRow>
            <DetailRow label="Transition">{prettyTransition(selected.transition)}</DetailRow>
            <DetailRow label="Sent at">{formatDateTimeFull(selected.createdAt)}</DetailRow>
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
