import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Beat, Device } from '@device-monitoring/shared';
import { DetailRow, EmptyState, LoadingBlock, Modal, SectionHeader, StatusBadge } from '../components/index.js';
import { calcStats, formatDateTime, formatDateTimeFull, formatLatency, statusTone } from '../lib/format.js';
import { api } from '../api.js';
import { IncidentTimeline } from './IncidentTimeline.js';
import { LatencyChart } from './LatencyChart.js';
import { UptimeHeatmap } from './UptimeHeatmap.js';

export function DeviceDetail({ device }: { device: Device }) {
  const beats = useQuery({ queryKey: ['beats', device.id], queryFn: () => api.beats(device.id), refetchInterval: 10_000 });
  const chronological = useMemo(() => (beats.data?.beats ?? []).slice().reverse(), [beats.data]);
  const stats = useMemo(() => calcStats(chronological), [chronological]);
  const timeline = chronological.slice(-60);
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);

  const uptimeClass =
    stats.uptimePct === null ? '' : stats.uptimePct >= 99 ? 'value-up' : stats.uptimePct >= 95 ? 'value-warn' : 'value-down';

  return (
    <section className="card detail-card">
      <SectionHeader
        eyebrow="Beat history"
        title={device.name}
        description={`${device.host} · ${statusTone[device.currentStatus]?.hint ?? 'Monitoring status'}`}
        action={<StatusBadge status={device.currentStatus} />}
      />

      <div className="device-snapshot">
        <div>
          <span>Latest latency</span>
          <strong>{formatLatency(device.lastLatencyMs)}</strong>
        </div>
        <div>
          <span>Last check</span>
          <strong>{formatDateTime(device.lastCheckedAt)}</strong>
        </div>
        <div>
          <span>Interval</span>
          <strong>{device.intervalSeconds}s</strong>
        </div>
        {stats.uptimePct !== null ? (
          <div>
            <span>Uptime</span>
            <strong className={uptimeClass}>{stats.uptimePct}%</strong>
          </div>
        ) : null}
        {stats.avg !== null ? (
          <div>
            <span>Avg latency</span>
            <strong>{stats.avg}ms</strong>
          </div>
        ) : null}
        {stats.p95 !== null ? (
          <div>
            <span>P95 latency</span>
            <strong>{stats.p95}ms</strong>
          </div>
        ) : null}
      </div>

      {beats.isLoading ? <LoadingBlock label="Loading beat history…" /> : null}
      {!beats.isLoading && chronological.length === 0 ? (
        <EmptyState title="No beats yet" description="The scheduler has not recorded a check for this device yet." />
      ) : null}

      {chronological.length > 0 ? (
        <>
          <LatencyChart beats={chronological} deviceId={device.id} thresholdMs={device.latencyThresholdMs} />
          <div className="timeline" aria-label={`Status timeline for ${device.name}`}>
            {timeline.map((beat) => (
              <button
                key={beat.id}
                type="button"
                className={`beat beat-${beat.status}`}
                title={`${formatDateTime(beat.checkedAt)} · ${formatLatency(beat.latencyMs)}${beat.error ? ` · ${beat.error}` : ''}`}
                aria-label={`Beat at ${formatDateTime(beat.checkedAt)}, ${beat.status}`}
                onClick={() => setSelectedBeat(beat)}
              />
            ))}
          </div>
        </>
      ) : null}

      <UptimeHeatmap deviceId={device.id} />
      <IncidentTimeline deviceId={device.id} />

      <Modal open={selectedBeat !== null} title="Beat detail" onClose={() => setSelectedBeat(null)}>
        {selectedBeat ? (
          <div className="detail-rows">
            <DetailRow label="Device">
              <strong>{device.name}</strong>
            </DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={selectedBeat.status} />
            </DetailRow>
            <DetailRow label="Checked at">{formatDateTimeFull(selectedBeat.checkedAt)}</DetailRow>
            <DetailRow label="Latency">{formatLatency(selectedBeat.latencyMs)}</DetailRow>
            {selectedBeat.error ? (
              <DetailRow label="Error">
                <pre className="detail-error">{selectedBeat.error}</pre>
              </DetailRow>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
