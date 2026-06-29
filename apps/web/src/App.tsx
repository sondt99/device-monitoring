import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Device, NotificationChannelType } from '@device-monitoring/shared';
import { api } from './api.js';

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
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
      <form className="card login-card" onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
        <p className="eyebrow">Self-hosted uptime</p>
        <h1>Device Monitoring</h1>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {login.error ? <p className="error">{login.error.message}</p> : null}
        <button disabled={login.isPending}>Sign in</button>
      </form>
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
    mutationFn: () => editing
      ? api.updateDevice(editing.id, { name, host, intervalSeconds, timeoutMs, retries, enabled })
      : api.createDevice({ name, host, intervalSeconds, timeoutMs, retries, enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      setName(''); setHost(''); onDone?.();
    }
  });
  return (
    <form className="grid-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <input placeholder="Host/IP" value={host} onChange={(event) => setHost(event.target.value)} />
      <input type="number" min={10} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))} />
      <input type="number" min={500} value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} />
      <input type="number" min={0} value={retries} onChange={(event) => setRetries(Number(event.target.value))} />
      <label className="inline"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enabled</label>
      <button>{editing ? 'Save' : 'Add device'}</button>
    </form>
  );
}

function DeviceDetail({ device }: { device: Device }) {
  const beats = useQuery({ queryKey: ['beats', device.id], queryFn: () => api.beats(device.id) });
  const latest = beats.data?.beats.slice(0, 24).reverse() ?? [];
  return (
    <section className="card detail-card">
      <h3>{device.name} beats</h3>
      <div className="timeline">
        {latest.map((beat) => (
          <span key={beat.id} className={`beat beat-${beat.status}`} title={`${beat.checkedAt} ${beat.latencyMs ?? 'down'}ms`} />
        ))}
      </div>
      <div className="latencies">
        {latest.map((beat) => <span key={beat.id}>{beat.latencyMs === null ? 'down' : `${beat.latencyMs}ms`}</span>)}
      </div>
    </section>
  );
}

function DevicesPanel() {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ['devices'], queryFn: api.devices });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = devices.data?.devices.find((device) => device.id === selectedId) ?? devices.data?.devices[0];
  const remove = useMutation({ mutationFn: api.deleteDevice, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['devices'] }) });
  return (
    <section className="stack">
      <div className="card"><h2>Devices</h2><DeviceForm /></div>
      <div className="card table-card">
        <table>
          <thead><tr><th>Name</th><th>Host</th><th>Status</th><th>Latency</th><th>Last check</th><th /></tr></thead>
          <tbody>{devices.data?.devices.map((device) => (
            <tr key={device.id} onClick={() => setSelectedId(device.id)}>
              <td>{device.name}</td><td>{device.host}</td><td><StatusBadge status={device.currentStatus} /></td>
              <td>{device.lastLatencyMs === null ? '—' : `${device.lastLatencyMs}ms`}</td><td>{device.lastCheckedAt ?? 'Never'}</td>
              <td><button className="ghost" onClick={(event) => { event.stopPropagation(); remove.mutate(device.id); }}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
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
  const [configText, setConfigText] = useState('{\n  "webhookUrl": ""\n}');
  const create = useMutation({
    mutationFn: () => api.createChannel({ type, name, enabled: true, config: JSON.parse(configText) as Record<string, unknown> }),
    onSuccess: () => { setName(''); void queryClient.invalidateQueries({ queryKey: ['channels'] }); }
  });
  const test = useMutation({ mutationFn: api.testChannel });
  const remove = useMutation({ mutationFn: api.deleteChannel, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['channels'] }) });
  return (
    <section className="card">
      <h2>Notification channels</h2>
      <form className="grid-form" onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(); }}>
        <select value={type} onChange={(event) => setType(event.target.value as NotificationChannelType)}><option value="discord">Discord</option><option value="telegram">Telegram</option><option value="webhook">Webhook</option></select>
        <input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} />
        <button>Add channel</button>
      </form>
      {create.error ? <p className="error">{create.error.message}</p> : null}
      <ul className="channel-list">{channels.data?.channels.map((channel) => (
        <li key={channel.id}><strong>{channel.name}</strong> <span>{channel.type}</span><code>{JSON.stringify(channel.config)}</code><button onClick={() => test.mutate(channel.id)}>Test</button><button className="ghost" onClick={() => remove.mutate(channel.id)}>Delete</button></li>
      ))}</ul>
      {test.error ? <p className="error">{test.error.message}</p> : null}
    </section>
  );
}

function Dashboard() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary });
  const cards = useMemo(() => [
    ['Total', summary.data?.total ?? 0], ['Up', summary.data?.up ?? 0], ['Down', summary.data?.down ?? 0], ['Unknown', summary.data?.unknown ?? 0]
  ], [summary.data]);
  return (
    <section className="stack">
      <div className="stats">{cards.map(([label, value]) => <div className="stat card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="card"><h2>Recent beats</h2><ul>{summary.data?.recentEvents.map((event) => <li key={`${event.deviceId}-${event.checkedAt}`}><StatusBadge status={event.status} /> {event.deviceName} {event.latencyMs ?? 'down'}ms</li>)}</ul></div>
    </section>
  );
}

export function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const queryClient = useQueryClient();
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => void queryClient.clear() });
  if (me.isLoading) return <main className="login-shell">Loading…</main>;
  if (me.error) return <LoginPage />;
  return (
    <main className="app-shell">
      <header><div><p className="eyebrow">Device Monitoring</p><h1>Operational dashboard</h1></div><button onClick={() => logout.mutate()}>Logout</button></header>
      <Dashboard />
      <DevicesPanel />
      <NotificationPanel />
    </main>
  );
}
