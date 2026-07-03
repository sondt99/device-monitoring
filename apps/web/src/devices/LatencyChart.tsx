import type { Beat } from '@device-monitoring/shared';
import { formatDateTime, formatLatency } from '../lib/format.js';

// SVG presentation attributes can't resolve `var()`, so theme-aware colors
// are applied via the style prop instead of stroke=/fill= attributes.
const accent = { color: 'var(--accent)' };
const danger = { color: 'var(--danger)' };
const warning = { color: 'var(--warning)' };

export function LatencyChart({ beats, deviceId, thresholdMs }: { beats: Beat[]; deviceId: number; thresholdMs?: number | null }) {
  const W = 1000;
  const H = 180;
  const PY = 14; // top and bottom padding inside the SVG plot area

  const plotH = H - PY * 2;
  const n = beats.length;

  const upLatencies = beats
    .filter((b) => b.status === 'up' && b.latencyMs !== null)
    .map((b) => b.latencyMs!);
  const maxLat = Math.max(upLatencies.length > 0 ? Math.max(...upLatencies) : 100, thresholdMs ?? 0);
  const yMax = Math.ceil((maxLat * 1.25) / 10) * 10 || 100;

  const xOf = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const yOf = (ms: number) => PY + plotH - Math.min(1, ms / yMax) * plotH;

  // Build connected line segments; break when a down beat is encountered
  const segments: { x: number; y: number; beat: Beat }[][] = [];
  let cur: { x: number; y: number; beat: Beat }[] = [];
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (b.status === 'up' && b.latencyMs !== null) {
      cur.push({ x: xOf(i), y: yOf(b.latencyMs), beat: b });
    } else {
      if (cur.length) {
        segments.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length) segments.push(cur);

  const downBeats = beats.map((b, i) => ({ b, i })).filter(({ b }) => b.status === 'down');
  const dotR = n < 40 ? 4 : n < 100 ? 3 : 2;
  const gradId = `lc${deviceId}`;

  return (
    <div className="latency-chart">
      <div className="chart-ylabels">
        <span>{yMax}ms</span>
        <span>{Math.round(yMax / 2)}ms</span>
        <span>0ms</span>
      </div>
      <div className="chart-area">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[PY, PY + plotH / 2, PY + plotH].map((y, gi) => (
            <line key={gi} x1={0} y1={y} x2={W} y2={y} style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" />
          ))}

          {/* Latency alert threshold */}
          {thresholdMs ? (
            <g style={warning}>
              <line
                x1={0}
                y1={yOf(thresholdMs)}
                x2={W}
                y2={yOf(thresholdMs)}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="8,5"
                opacity="0.55"
              />
              <text x={W - 8} y={yOf(thresholdMs) - 6} textAnchor="end" fill="currentColor" opacity="0.75" fontSize="12">
                alert {thresholdMs}ms
              </text>
            </g>
          ) : null}

          {/* Down beat markers */}
          {downBeats.map(({ b, i }) => (
            <g key={b.id} style={danger}>
              <line
                x1={xOf(i)}
                y1={PY}
                x2={xOf(i)}
                y2={PY + plotH}
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="4,3"
                opacity="0.45"
              />
              <circle cx={xOf(i)} cy={PY + plotH - 5} r={5} fill="currentColor" opacity="0.7">
                <title>{formatDateTime(b.checkedAt)} · DOWN{b.error ? ` · ${b.error}` : ''}</title>
              </circle>
            </g>
          ))}

          {/* Fill under each connected line segment */}
          {segments.map((seg, si) => {
            if (seg.length < 2) return null;
            const bottom = PY + plotH;
            const d = `M${seg[0].x},${bottom} ${seg.map((p) => `L${p.x},${p.y}`).join(' ')} L${seg[seg.length - 1].x},${bottom} Z`;
            return <path key={si} d={d} fill={`url(#${gradId})`} />;
          })}

          {/* Lines connecting up beats */}
          {segments.map((seg, si) =>
            seg.length >= 2 ? (
              <polyline
                key={si}
                points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                style={accent}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null
          )}

          {/* Dots at each up beat */}
          {beats.map((b, i) => {
            if (b.status !== 'up' || b.latencyMs === null) return null;
            return (
              <circle key={b.id} cx={xOf(i)} cy={yOf(b.latencyMs)} r={dotR} style={accent} fill="currentColor">
                <title>
                  {formatDateTime(b.checkedAt)} · {formatLatency(b.latencyMs)}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
