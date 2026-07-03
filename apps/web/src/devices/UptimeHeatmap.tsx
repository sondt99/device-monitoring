import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

export function UptimeHeatmap({ deviceId }: { deviceId: number }) {
  const uptime = useQuery({ queryKey: ['uptime', deviceId], queryFn: () => api.uptime(deviceId, 30), refetchInterval: 60_000 });
  const days = uptime.data?.uptime ?? [];
  if (days.length === 0) return null;

  return (
    <div className="uptime-heatmap">
      <span className="heatmap-label">30-day uptime</span>
      <div className="heatmap-cells">
        {days.map((d) => {
          const cls = d.uptimePct >= 99.5 ? 'hm-full' : d.uptimePct >= 95 ? 'hm-warn' : d.uptimePct >= 50 ? 'hm-low' : 'hm-down';
          return <span key={d.date} className={`hm-cell ${cls}`} title={`${d.date}: ${d.uptimePct}% (${d.up}/${d.total})`} />;
        })}
      </div>
      <div className="heatmap-legend">
        <span className="hm-cell hm-down" /> 0%
        <span className="hm-cell hm-low" /> 50%
        <span className="hm-cell hm-warn" /> 95%
        <span className="hm-cell hm-full" /> 100%
      </div>
    </div>
  );
}
