import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Device, DeviceStatus, NotificationChannelType } from '@device-monitoring/shared';
import { api } from './api.js';

const statusTone: Record<string, { label: string; hint: string }> = {
  up: { label: 'Online', hint: 'Responding normally' },
  down: { label: 'Offline', hint: 'Needs attention' },
  unknown: { label: 'Unknown', hint: 'Waiting for first beat' }
};

const channelTemplates: Record<NotificationChannelType, string> = {
  discord: '{\n  "webhookUrl": "https://discord.com/api/webhooks/..."\n}',
  telegram: '{\n  "botToken": "123456:bot-token",\n  "chatId": "123456789"\n}',
  webhook: '{\n  "url": "https://example.com/device-monitoring-hook"\n}'
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

function StatusBadge({ status }: { status: string }) {
  const meta = statusTone[status] ?? { label: status, hint: status };
  return (
    <span className={`badge badge-${status}`} title={meta.hint}>
      <span className="badge-dot" />
      {meta.label}
    </span>
  );
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

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
          <p>
            Monitor devices, latency, beat history, and alert transitions from one clean
            command-center dashboard.
          </p>
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
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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

function DeviceForm({ editing, onDone }: { editing?: Device; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [host, setHost] = useState(editing?.host ?? '');
  const [intervalSeconds, setIntervalSeconds] = useState(editing?.intervalSeconds ?? 60);
  const [timeoutMs, setTimeoutMs] = useState(editing?.timeoutMs ?? 5000);
  const [retries, setRetries] = useState(editing?.retries ?? 1);
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);
  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? api.updateDevice(editing.id, { name, host, intervalSeconds, timeoutMs, retries, enabled })
        : api.createDevice({ name, host, intervalSeconds, timeoutMs, retries, enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      if (!editing) {
        setName('');
        setHost('');
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
      <Field label="Device name">
        <input placeholder="Core router" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Host or IP">
        <input placeholder="192.168.1.1" value={host} onChange={(event) => setHost(event.target.value)} />
      </Field>
      <Field label="Interval" hint="Seconds between checks">
        <input type="number" min={10} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))} />
      </Field>
      <Field label="Timeout" hint="Milliseconds">
        <input type="number" min={500} value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} />
      </Field>
      <Field label="Retries" hint="Extra attempts before down">
        <input type="number" min={0} value={retries} onChange={(event) => setRetries(Number(event.target.value))} />
      </Field>
      <label className="toggle-field">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
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

function DeviceDetail({ device }: { device: Device }) {
  const beats = useQuery({ queryKey: ['beats', device.id], queryFn: () => api.beats(device.id) });
  const latest = beats.data?.beats.slice(0, 24).reverse() ?? [];

  return (
    <section className="card detail-card">
      <SectionHeader
        eyebrow="Beat timeline"
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
          <span>Check interval</span>
          <strong>{device.intervalSeconds}s</strong>
        </div>
      </div>

      {beats.isLoading ? <LoadingBlock label="Loading beat history…" /> : null}
      {!beats.isLoading && latest.length === 0 ? (
        <EmptyState title="No beats yet" description="The scheduler has not recorded a check for this device yet." />
      ) : null}
      {latest.length > 0 ? (
        <>
          <div className="timeline" aria-label={`Recent beat history for ${device.name}`}>
            {latest.map((beat) => (
              <span
                key={beat.id}
                className={`beat beat-${beat.status}`}
                title={`${formatDateTime(beat.checkedAt)} · ${formatLatency(beat.latencyMs)}${beat.error ? ` · ${beat.error}` : ''}`}
              />
            ))}
          </div>
          <div className="latencies">
            {latest.map((beat) => (
              <span key={beat.id}>{beat.status === 'down' ? 'down' : formatLatency(beat.latencyMs)}</span>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function DevicesPanel() {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ['devices'], queryFn: api.devices });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = devices.data?.devices.find((device) => device.id === selectedId) ?? devices.data?.devices[0];
  const remove = useMutation({
    mutationFn: api.deleteDevice,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    }
  });

  return (
    <section className="stack devices-section">
      <div className="card">
        <SectionHeader
          eyebrow="Inventory"
          title="Devices"
          description="Add network devices, hosts, or appliances and define how often they should be checked."
        />
        <DeviceForm />
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
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Last check</th>
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
                      <StatusBadge status={device.currentStatus} />
                    </td>
                    <td>{formatLatency(device.lastLatencyMs)}</td>
                    <td>{formatDateTime(device.lastCheckedAt)}</td>
                    <td>{device.enabled ? <span className="enabled-dot">Enabled</span> : <span className="disabled-dot">Paused</span>}</td>
                    <td>
                      <button
                        className="ghost danger"
                        type="button"
                        aria-label={`Delete ${device.name}`}
                        disabled={remove.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          remove.mutate(device.id);
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
    </section>
  );
}

function NotificationPanel() {
  const queryClient = useQueryClient();
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.channels });
  const [type, setType] = useState<NotificationChannelType>('discord');
  const [name, setName] = useState('');
  const [configText, setConfigText] = useState(channelTemplates.discord);
  const [configError, setConfigError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (config: Record<string, unknown>) => api.createChannel({ type, name, enabled: true, config }),
    onSuccess: () => {
      setName('');
      setConfigError(null);
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    }
  });
  const test = useMutation({ mutationFn: api.testChannel });
  const remove = useMutation({ mutationFn: api.deleteChannel, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['channels'] }) });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const parsed = JSON.parse(configText) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setConfigError('Config must be a JSON object.');
        return;
      }
      setConfigError(null);
      create.mutate(parsed as Record<string, unknown>);
    } catch {
      setConfigError('Invalid JSON config. Check quotes, commas, and braces.');
    }
  }

  return (
    <section className="card notifications-card">
      <SectionHeader
        eyebrow="Alerts"
        title="Notification channels"
        description="Send alerts only when devices change state, keeping signal high and noise low."
      />
      <form className="notification-form" onSubmit={handleSubmit}>
        <Field label="Channel type">
          <select
            value={type}
            onChange={(event) => {
              const nextType = event.target.value as NotificationChannelType;
              setType(nextType);
              setConfigText(channelTemplates[nextType]);
              setConfigError(null);
            }}
          >
            <option value="discord">Discord</option>
            <option value="telegram">Telegram</option>
            <option value="webhook">Webhook</option>
          </select>
        </Field>
        <Field label="Channel name">
          <input placeholder="Ops alerts" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="JSON config" hint="Secrets are redacted in API responses and the UI.">
          <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
        </Field>
        {(configError ?? create.error?.message) ? <p className="error form-error">{configError ?? create.error?.message}</p> : null}
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
          {channels.data.channels.map((channel) => (
            <li className="channel-card" key={channel.id}>
              <div>
                <strong>{channel.name}</strong>
                <span className="channel-type">{channel.type}</span>
              </div>
              <code>{JSON.stringify(channel.config)}</code>
              <div className="channel-actions">
                <button className="ghost" type="button" disabled={test.isPending} onClick={() => test.mutate(channel.id)}>
                  Test
                </button>
                <button className="ghost danger" type="button" disabled={remove.isPending} onClick={() => remove.mutate(channel.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {test.error ? <p className="error form-error">{test.error.message}</p> : null}
    </section>
  );
}

type StatCard = {
  key: DeviceStatus | 'total';
  label: string;
  value: number;
  caption: string;
};

function Dashboard() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary });
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
    <section className="stack dashboard-section">
      <div className="stats">
        {cards.map((card) => (
          <div className={`stat card stat-${card.key}`} key={card.key}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.caption}</small>
          </div>
        ))}
      </div>
      <div className="card recent-card">
        <SectionHeader title="Recent beats" description="Latest checks across all monitored devices." />
        {summary.isLoading ? <LoadingBlock label="Loading recent beats…" /> : null}
        {!summary.isLoading && summary.data?.recentEvents.length === 0 ? (
          <EmptyState title="No beat events yet" description="Events appear here after the scheduler records checks." />
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
    </section>
  );
}

export function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const queryClient = useQueryClient();
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => void queryClient.clear() });

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
      <Dashboard />
      <DevicesPanel />
      <NotificationPanel />
    </main>
  );
}
