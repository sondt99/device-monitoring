import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Beat, CheckType, Device, DeviceStatus, NotificationChannel, NotificationChannelType, NotificationEvent } from '@device-monitoring/shared';
import { api } from './api.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const statusTone: Record<string, { label: string; hint: string }> = {
  up: { label: 'Online', hint: 'Responding normally' },
  down: { label: 'Offline', hint: 'Needs attention' },
  unknown: { label: 'Unknown', hint: 'Waiting for first beat' }
};

function formatDateTime(value?: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatLatency(value?: number | null): string {
  return value === null || value === undefined ? '—' : `${value}ms`;
}

interface BeatStats {
  uptimePct: number | null;
  avg: number | null;
  min: number | null;
  p95: number | null;
}

function calcStats(beats: Beat[]): BeatStats {
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

function deriveHost(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

// ─── shared presentational components ────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const meta = statusTone[status] ?? { label: status, hint: status };
  return (
    <span className={`badge badge-${status}`} title={meta.hint}>
      <span className="badge-dot" />
      {meta.label}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-orb" aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" aria-live="polite">
      <span className="skeleton skeleton-wide" />
      <span className="skeleton" />
      <span>{label}</span>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

// ─── confirm dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel]
  );

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className="confirm-dialog" onKeyDown={handleKeyDown} onClick={onCancel}>
      <div className="confirm-dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="confirm-dialog-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary danger" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ─── SVG latency chart ────────────────────────────────────────────────────────

function LatencyChart({ beats, deviceId }: { beats: Beat[]; deviceId: number }) {
  const W = 1000;
  const H = 180;
  const PY = 14; // top and bottom padding inside the SVG plot area

  const plotH = H - PY * 2;
  const n = beats.length;

  const upLatencies = beats
    .filter((b) => b.status === 'up' && b.latencyMs !== null)
    .map((b) => b.latencyMs!);
  const maxLat = upLatencies.length > 0 ? Math.max(...upLatencies) : 100;
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
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[PY, PY + plotH / 2, PY + plotH].map((y, gi) => (
            <line key={gi} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          ))}

          {/* Down beat markers */}
          {downBeats.map(({ b, i }) => (
            <g key={b.id}>
              <line
                x1={xOf(i)}
                y1={PY}
                x2={xOf(i)}
                y2={PY + plotH}
                stroke="#fb7185"
                strokeWidth="2"
                strokeDasharray="4,3"
                opacity="0.45"
              />
              <circle cx={xOf(i)} cy={PY + plotH - 5} r={5} fill="#fb7185" opacity="0.7">
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
                stroke="#34d399"
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
              <circle key={b.id} cx={xOf(i)} cy={yOf(b.latencyMs)} r={dotR} fill="#34d399">
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

// ─── login ────────────────────────────────────────────────────────────────────

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const login = useMutation({
    mutationFn: () => api.login({ username, password }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me'] })
  });

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-hero">
          <p className="eyebrow">Self-hosted uptime</p>
          <h1>Device Monitoring</h1>
          <p>Monitor devices, latency, beat history, and alert transitions from one clean command-center dashboard.</p>
          <div className="feature-pills" aria-label="Key features">
            <span>Live status</span>
            <span>Beat history</span>
            <span>Telegram / Discord alerts</span>
          </div>
        </div>

        <form
          className="card login-card"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <div className="login-card-header">
            <p className="eyebrow">Secure access</p>
            <h2>Sign in</h2>
            <p>Use the admin account created on first boot.</p>
          </div>
          <Field label="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          {login.error ? <p className="error auth-error">{login.error.message}</p> : null}
          <button className="primary full-width" type="submit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

// ─── device form ──────────────────────────────────────────────────────────────

function DeviceForm({ editing, onDone }: { editing?: Device; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [host, setHost] = useState(editing?.host ?? '');
  const [checkType, setCheckType] = useState<CheckType>(editing?.checkType ?? 'ping');
  const [checkUrl, setCheckUrl] = useState(editing?.checkUrl ?? '');
  const [intervalSeconds, setIntervalSeconds] = useState(editing?.intervalSeconds ?? 60);
  const [timeoutMs, setTimeoutMs] = useState(editing?.timeoutMs ?? 5000);
  const [retries, setRetries] = useState(editing?.retries ?? 1);
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);

  useEffect(() => {
    setName(editing?.name ?? '');
    setHost(editing?.host ?? '');
    setCheckType(editing?.checkType ?? 'ping');
    setCheckUrl(editing?.checkUrl ?? '');
    setIntervalSeconds(editing?.intervalSeconds ?? 60);
    setTimeoutMs(editing?.timeoutMs ?? 5000);
    setRetries(editing?.retries ?? 1);
    setEnabled(editing?.enabled ?? true);
  }, [editing?.id]);

  const mutation = useMutation({
    mutationFn: () => {
      const resolvedCheckUrl = checkType === 'http' ? checkUrl || null : null;
      return editing
        ? api.updateDevice(editing.id, { name, host, checkType, checkUrl: resolvedCheckUrl, intervalSeconds, timeoutMs, retries, enabled })
        : api.createDevice({ name, host, checkType, checkUrl: resolvedCheckUrl, intervalSeconds, timeoutMs, retries, enabled });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      if (!editing) {
        setName('');
        setHost('');
        setCheckUrl('');
      }
      onDone?.();
    }
  });

  return (
    <form
      className="device-form"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Field label="Device name" className="field-device-name">
        <input placeholder="Core router" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="field field-check-type">
        <span>Check type</span>
        <div className="toggle-group">
          <button
            type="button"
            className={checkType === 'ping' ? 'toggle-active' : ''}
            onClick={() => setCheckType('ping')}
          >
            Ping
          </button>
          <button
            type="button"
            className={checkType === 'http' ? 'toggle-active' : ''}
            onClick={() => setCheckType('http')}
          >
            HTTP
          </button>
        </div>
      </div>
      {checkType === 'ping' ? (
        <Field label="Host / IP" hint="Hostname, FQDN, or IPv4/IPv6 address" className="field-host">
          <input placeholder="192.168.1.1" value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
      ) : (
        <Field label="Endpoint URL" hint="Full HTTPS URL to probe — host derived automatically." className="field-check-url">
          <input
            type="url"
            placeholder="https://example.com/health"
            value={checkUrl}
            onChange={(e) => {
              setCheckUrl(e.target.value);
              setHost(deriveHost(e.target.value));
            }}
          />
        </Field>
      )}
      <Field label="Interval" hint="Seconds between checks">
        <input
          type="number"
          min={10}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
        />
      </Field>
      <Field label="Timeout" hint="Milliseconds">
        <input type="number" min={500} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} />
      </Field>
      <Field label="Retries" hint="Extra attempts before down">
        <input type="number" min={0} value={retries} onChange={(e) => setRetries(Number(e.target.value))} />
      </Field>
      <label className="toggle-field">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          <strong>Enabled</strong>
          <small>Scheduler will check this device.</small>
        </span>
      </label>
      {mutation.error ? <p className="error form-error">{mutation.error.message}</p> : null}
      <button className="primary form-submit" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : editing ? 'Save device' : 'Add device'}
      </button>
    </form>
  );
}

// ─── device detail with SVG chart ─────────────────────────────────────────────

function DeviceDetail({ device }: { device: Device }) {
  const beats = useQuery({ queryKey: ['beats', device.id], queryFn: () => api.beats(device.id), refetchInterval: 10_000 });
  const chronological = useMemo(() => (beats.data?.beats ?? []).slice().reverse(), [beats.data]);
  const stats = useMemo(() => calcStats(chronological), [chronological]);
  const timeline = chronological.slice(-60);

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
          <LatencyChart beats={chronological} deviceId={device.id} />
          <div className="timeline" aria-label={`Status timeline for ${device.name}`}>
            {timeline.map((beat) => (
              <span
                key={beat.id}
                className={`beat beat-${beat.status}`}
                title={`${formatDateTime(beat.checkedAt)} · ${formatLatency(beat.latencyMs)}${beat.error ? ` · ${beat.error}` : ''}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

// ─── devices panel ────────────────────────────────────────────────────────────

function DevicesPanel() {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ['devices'], queryFn: api.devices, refetchInterval: 10_000 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
  const selected = devices.data?.devices.find((d) => d.id === selectedId) ?? devices.data?.devices[0];

  const remove = useMutation({
    mutationFn: api.deleteDevice,
    onSuccess: () => {
      setDeletingDevice(null);
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    }
  });

  return (
    <section className="stack devices-section">
      <div className="card">
        <SectionHeader
          eyebrow="Inventory"
          title={editingDevice ? `Edit — ${editingDevice.name}` : 'Devices'}
          description={
            editingDevice
              ? 'Update device settings and save.'
              : 'Add network devices, hosts, or appliances and define how often they should be checked.'
          }
          action={
            editingDevice ? (
              <button className="ghost" type="button" onClick={() => setEditingDevice(null)}>
                Cancel edit
              </button>
            ) : undefined
          }
        />
        <DeviceForm
          editing={editingDevice ?? undefined}
          onDone={() => setEditingDevice(null)}
        />
      </div>

      <div className="card table-card">
        <SectionHeader title="Device inventory" description="Select a device to inspect its latest beat history." />
        {devices.isLoading ? <LoadingBlock label="Loading devices…" /> : null}
        {!devices.isLoading && devices.data?.devices.length === 0 ? (
          <EmptyState title="No devices configured" description="Add your first router, NAS, server, or IoT device above." />
        ) : null}
        {devices.data && devices.data.devices.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Host</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Last check</th>
                  <th>Last online</th>
                  <th>Enabled</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {devices.data.devices.map((device) => (
                  <tr
                    key={device.id}
                    className={selected?.id === device.id ? 'selected-row' : undefined}
                    onClick={() => setSelectedId(device.id)}
                  >
                    <td>
                      <strong>{device.name}</strong>
                    </td>
                    <td className="muted-mono">{device.host}</td>
                    <td>
                      <span className={`check-type-badge check-type-${device.checkType}`}>
                        {device.checkType === 'http' ? 'HTTP' : 'Ping'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={device.currentStatus} />
                    </td>
                    <td>{formatLatency(device.lastLatencyMs)}</td>
                    <td>{formatDateTime(device.lastCheckedAt)}</td>
                    <td>{formatDateTime(device.lastOnlineAt)}</td>
                    <td>
                      {device.enabled ? (
                        <span className="enabled-dot">Enabled</span>
                      ) : (
                        <span className="disabled-dot">Paused</span>
                      )}
                    </td>
                    <td className="row-actions">
                      <button
                        className="ghost"
                        type="button"
                        aria-label={`Edit ${device.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDevice(device);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="ghost danger"
                        type="button"
                        aria-label={`Delete ${device.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingDevice(device);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {selected ? <DeviceDetail device={selected} /> : null}

      <ConfirmDialog
        open={deletingDevice !== null}
        title={`Delete ${deletingDevice?.name ?? 'device'}?`}
        description="This will permanently remove the device and all its beat history. This action cannot be undone."
        onConfirm={() => {
          if (deletingDevice) remove.mutate(deletingDevice.id);
        }}
        onCancel={() => setDeletingDevice(null)}
      />
    </section>
  );
}

// ─── notification channel structured forms ────────────────────────────────────

interface ChannelFields {
  discordWebhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  webhookUrl: string;
}

function ChannelConfigFields({
  type,
  fields,
  onChange
}: {
  type: NotificationChannelType;
  fields: ChannelFields;
  onChange: (partial: Partial<ChannelFields>) => void;
}) {
  if (type === 'discord') {
    return (
      <Field
        label="Webhook URL"
        hint="Server Settings → Integrations → Webhooks → Copy Webhook URL."
        className="field-config"
      >
        <input
          type="url"
          placeholder="https://discord.com/api/webhooks/123456/token"
          value={fields.discordWebhookUrl}
          onChange={(e) => onChange({ discordWebhookUrl: e.target.value })}
        />
      </Field>
    );
  }
  if (type === 'telegram') {
    return (
      <>
        <Field label="Bot Token" hint="From @BotFather — /newbot then copy the token." className="field-config">
          <input
            placeholder="123456789:AABBcc..."
            value={fields.telegramBotToken}
            onChange={(e) => onChange({ telegramBotToken: e.target.value })}
          />
        </Field>
        <Field label="Chat ID" hint="Your personal ID, group chat ID, or channel ID." className="field-config">
          <input
            placeholder="-1001234567890"
            value={fields.telegramChatId}
            onChange={(e) => onChange({ telegramChatId: e.target.value })}
          />
        </Field>
      </>
    );
  }
  return (
    <Field
      label="Endpoint URL"
      hint="Device Monitoring will POST a JSON payload with event details to this URL."
      className="field-config"
    >
      <input
        type="url"
        placeholder="https://example.com/hook"
        value={fields.webhookUrl}
        onChange={(e) => onChange({ webhookUrl: e.target.value })}
      />
    </Field>
  );
}

// ─── notification panel ───────────────────────────────────────────────────────

function NotificationPanel() {
  const queryClient = useQueryClient();
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.channels, refetchInterval: 30_000 });

  const [type, setType] = useState<NotificationChannelType>('discord');
  const [channelName, setChannelName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [channelFields, setChannelFields] = useState<ChannelFields>({
    discordWebhookUrl: '',
    telegramBotToken: '',
    telegramChatId: '',
    webhookUrl: ''
  });

  const [deletingChannel, setDeletingChannel] = useState<NotificationChannel | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; message: string } | undefined>>({});

  function updateFields(partial: Partial<ChannelFields>) {
    setChannelFields((prev) => ({ ...prev, ...partial }));
    setFormError(null);
  }

  function buildConfig(): Record<string, unknown> | null {
    if (type === 'discord') {
      if (!channelFields.discordWebhookUrl.trim()) {
        setFormError('Webhook URL is required');
        return null;
      }
      return { webhookUrl: channelFields.discordWebhookUrl.trim() };
    }
    if (type === 'telegram') {
      if (!channelFields.telegramBotToken.trim() || !channelFields.telegramChatId.trim()) {
        setFormError('Bot token and Chat ID are both required');
        return null;
      }
      return { botToken: channelFields.telegramBotToken.trim(), chatId: channelFields.telegramChatId.trim() };
    }
    if (!channelFields.webhookUrl.trim()) {
      setFormError('Endpoint URL is required');
      return null;
    }
    return { url: channelFields.webhookUrl.trim() };
  }

  const create = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.createChannel({ type, name: channelName, enabled: true, config }),
    onSuccess: () => {
      setChannelName('');
      setChannelFields({ discordWebhookUrl: '', telegramBotToken: '', telegramChatId: '', webhookUrl: '' });
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    }
  });

  const remove = useMutation({
    mutationFn: api.deleteChannel,
    onSuccess: () => {
      setDeletingChannel(null);
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    }
  });

  async function handleTest(id: number) {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: undefined }));
    try {
      await api.testChannel(id);
      setTestResults((prev) => ({ ...prev, [id]: { ok: true, message: 'Test notification sent successfully!' } }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof Error ? err.message : 'Test failed' }
      }));
    } finally {
      setTestingId(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const config = buildConfig();
    if (config) create.mutate(config);
  }

  function channelTypeName(t: NotificationChannelType): string {
    if (t === 'discord') return 'Discord';
    if (t === 'telegram') return 'Telegram';
    return 'Webhook';
  }

  function channelConfigLabel(channel: NotificationChannel): string {
    // chatId is not a secret so it survives redaction; other fields are masked
    if (channel.type === 'telegram') {
      const chatId = String(channel.config.chatId ?? '');
      return chatId ? `Chat ID: ${chatId}` : 'Token configured';
    }
    return 'Configured — secret redacted for display';
  }

  return (
    <section className="card notifications-card">
      <SectionHeader
        eyebrow="Alerts"
        title="Notification channels"
        description="Send alerts on state transitions: device goes down, comes back up, or is detected for the first time."
      />

      <form className="notification-form" onSubmit={handleSubmit}>
        <Field label="Channel type" className="field-type">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as NotificationChannelType);
              setFormError(null);
            }}
          >
            <option value="discord">Discord webhook</option>
            <option value="telegram">Telegram bot</option>
            <option value="webhook">Generic webhook</option>
          </select>
        </Field>
        <Field label="Display name" className="field-name">
          <input
            placeholder="Ops alerts, Home lab…"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
          />
        </Field>
        <ChannelConfigFields type={type} fields={channelFields} onChange={updateFields} />
        {(formError ?? create.error?.message) ? (
          <p className="error form-error">{formError ?? create.error?.message}</p>
        ) : null}
        <button className="primary form-submit" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add channel'}
        </button>
      </form>

      {channels.isLoading ? <LoadingBlock label="Loading notification channels…" /> : null}
      {!channels.isLoading && channels.data?.channels.length === 0 ? (
        <EmptyState title="No alert channels yet" description="Add Discord, Telegram, or webhook delivery for status changes." />
      ) : null}
      {channels.data && channels.data.channels.length > 0 ? (
        <ul className="channel-list">
          {channels.data.channels.map((channel) => {
            const result = testResults[channel.id];
            const isTesting = testingId === channel.id;
            return (
              <li className="channel-card" key={channel.id}>
                <div className="channel-card-head">
                  <div className="channel-card-info">
                    <strong>{channel.name}</strong>
                    <span className="channel-type">{channelTypeName(channel.type)}</span>
                  </div>
                  <p className="channel-config-label">{channelConfigLabel(channel)}</p>
                </div>
                <div className="channel-card-footer">
                  {result !== undefined ? (
                    <span className={result.ok ? 'test-ok' : 'test-error'}>{result.message}</span>
                  ) : (
                    <span />
                  )}
                  <div className="channel-actions">
                    <button
                      className="ghost"
                      type="button"
                      disabled={isTesting || testingId !== null}
                      onClick={() => void handleTest(channel.id)}
                    >
                      {isTesting ? 'Testing…' : 'Send test'}
                    </button>
                    <button className="ghost danger" type="button" disabled={remove.isPending} onClick={() => setDeletingChannel(channel)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <ConfirmDialog
        open={deletingChannel !== null}
        title={`Delete ${deletingChannel?.name ?? 'channel'}?`}
        description="This will permanently remove the notification channel. Future alerts will no longer be delivered here."
        onConfirm={() => {
          if (deletingChannel) remove.mutate(deletingChannel.id);
        }}
        onCancel={() => setDeletingChannel(null)}
      />
    </section>
  );
}

// ─── stat cards ───────────────────────────────────────────────────────────────

type StatCard = { key: DeviceStatus | 'total'; label: string; value: number; caption: string };

function StatCards() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 10_000 });
  const cards: StatCard[] = useMemo(
    () => [
      { key: 'total', label: 'Total', value: summary.data?.total ?? 0, caption: 'Configured devices' },
      { key: 'up', label: 'Online', value: summary.data?.up ?? 0, caption: 'Healthy right now' },
      { key: 'down', label: 'Offline', value: summary.data?.down ?? 0, caption: 'Needs attention' },
      { key: 'unknown', label: 'Unknown', value: summary.data?.unknown ?? 0, caption: 'Awaiting first beat' }
    ],
    [summary.data]
  );

  return (
    <div className="stats">
      {cards.map((card) => (
        <div className={`stat card stat-${card.key}`} key={card.key}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.caption}</small>
        </div>
      ))}
    </div>
  );
}

// ─── recent beats (compact sidebar) ──────────────────────────────────────────

function RecentBeats() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 10_000 });

  return (
    <div className="card recent-card">
      <SectionHeader eyebrow="Activity" title="Recent beats" />
      {summary.isLoading ? <LoadingBlock label="Loading…" /> : null}
      {!summary.isLoading && summary.data?.recentEvents.length === 0 ? (
        <EmptyState title="No events yet" description="Events appear after the scheduler records checks." />
      ) : null}
      {summary.data && summary.data.recentEvents.length > 0 ? (
        <ul className="event-list">
          {summary.data.recentEvents.map((event) => (
            <li key={`${event.deviceId}-${event.checkedAt}`}>
              <StatusBadge status={event.status} />
              <div>
                <strong>{event.deviceName}</strong>
                <span>{formatDateTime(event.checkedAt)}</span>
              </div>
              <em>{event.error ?? formatLatency(event.latencyMs)}</em>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─── notification history ────────────────────────────────────────────────────

function NotificationHistory() {
  const events = useQuery({ queryKey: ['notification-events'], queryFn: api.notificationEvents, refetchInterval: 30_000 });

  return (
    <div className="card notification-history-card">
      <SectionHeader eyebrow="Delivery log" title="Notification history" />
      {events.isLoading ? <LoadingBlock label="Loading…" /> : null}
      {!events.isLoading && events.data?.events.length === 0 ? (
        <EmptyState title="No deliveries yet" description="Notification events appear when device status changes trigger alerts." />
      ) : null}
      {events.data && events.data.events.length > 0 ? (
        <ul className="event-list notification-event-list">
          {events.data.events.map((event: NotificationEvent) => (
            <li key={event.id}>
              <span className={`notif-status ${event.success ? 'notif-ok' : 'notif-fail'}`}>
                {event.success ? 'Sent' : 'Failed'}
              </span>
              <div>
                <strong>{event.deviceName || `Device #${event.deviceId}`}</strong>
                <span>
                  {event.channelName ?? 'Deleted channel'} &middot; {event.transition} &middot; {formatDateTime(event.createdAt)}
                </span>
              </div>
              {event.error ? <em className="notif-error">{event.error}</em> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─── live title + favicon ────────────────────────────────────────────────────

function useLiveTitle(down: number) {
  useEffect(() => {
    document.title = down > 0 ? `(${down} down) Device Monitoring` : 'Device Monitoring';

    const svg = down > 0
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%23fb7185"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%2334d399"/></svg>';

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = `data:image/svg+xml,${svg}`;
  }, [down]);
}

// ─── app shell ────────────────────────────────────────────────────────────────

export function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const queryClient = useQueryClient();
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => void queryClient.clear() });
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 10_000, enabled: !me.error });
  useLiveTitle(summary.data?.down ?? 0);

  if (me.isLoading) {
    return (
      <main className="login-shell loading-shell">
        <LoadingBlock />
      </main>
    );
  }
  if (me.error) return <LoginPage />;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-copy">
          <p className="eyebrow">Device Monitoring</p>
          <h1>Operational dashboard</h1>
          <p>Track device availability, response time, beat history, and state-change alerts.</p>
        </div>
        <div className="header-actions">
          <span className="user-chip">{me.data?.user.username ?? 'Admin'}</span>
          <button className="ghost" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Logout
          </button>
        </div>
      </header>
      <StatCards />
      <DevicesPanel />
      <div className="bottom-row">
        <RecentBeats />
        <NotificationPanel />
      </div>
      <NotificationHistory />
    </main>
  );
}
