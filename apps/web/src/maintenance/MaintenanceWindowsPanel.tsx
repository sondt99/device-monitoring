import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MaintenanceWindow } from '@device-monitoring/shared';
import { useMe } from '../auth/useMe.js';
import { ConfirmDialog, EmptyState, Field, LoadingBlock, SectionHeader } from '../components/index.js';
import { formatDateTimeFull } from '../lib/format.js';
import { api } from '../api.js';

function isActiveNow(window: MaintenanceWindow): boolean {
  const now = Date.now();
  return new Date(window.startsAt).getTime() <= now && now <= new Date(window.endsAt).getTime();
}

export function MaintenanceWindowsPanel() {
  const queryClient = useQueryClient();
  const { isAdmin } = useMe();
  const devices = useQuery({ queryKey: ['devices'], queryFn: api.devices });
  const windows = useQuery({ queryKey: ['maintenance-windows'], queryFn: () => api.maintenanceWindows(), refetchInterval: 30_000 });

  const deviceList = devices.data?.devices ?? [];
  const [deviceId, setDeviceId] = useState<number | ''>('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [suppressNotifications, setSuppressNotifications] = useState(true);
  const [deleting, setDeleting] = useState<MaintenanceWindow | null>(null);

  const deviceName = useMemo(() => {
    const map = new Map(deviceList.map((d) => [d.id, d.name] as const));
    return (id: number) => map.get(id) ?? `Device #${id}`;
  }, [deviceList]);

  const create = useMutation({
    mutationFn: () =>
      api.createMaintenanceWindow({
        deviceId: Number(deviceId),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason: reason.trim() || null,
        suppressNotifications
      }),
    onSuccess: () => {
      setDeviceId('');
      setStartsAt('');
      setEndsAt('');
      setReason('');
      setSuppressNotifications(true);
      void queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] });
    }
  });

  const remove = useMutation({
    mutationFn: api.deleteMaintenanceWindow,
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] });
    }
  });

  const sorted = [...(windows.data?.maintenanceWindows ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return (
    <section className="stack">
      <div className="card table-card">
        <SectionHeader
          eyebrow="Scheduled"
          title="Maintenance windows"
          description="Alerts are suppressed for a device during an active window. Beat history keeps recording normally."
        />

        {isAdmin ? (
          <form
            className="notification-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (deviceId !== '' && startsAt && endsAt) create.mutate();
            }}
          >
            <Field label="Device" className="field-type">
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Select a device…</option>
                {deviceList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Starts">
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Ends">
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
            <Field label="Reason" hint="Optional" className="field-name">
              <input placeholder="Firmware upgrade" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <label className="toggle-field">
              <input type="checkbox" checked={suppressNotifications} onChange={(e) => setSuppressNotifications(e.target.checked)} />
              <span>
                <strong>Suppress notifications</strong>
                <small>Beats are still recorded either way.</small>
              </span>
            </label>
            {create.error ? <p className="error form-error">{create.error.message}</p> : null}
            <button className="primary form-submit" type="submit" disabled={create.isPending || deviceId === '' || !startsAt || !endsAt}>
              {create.isPending ? 'Scheduling…' : 'Schedule window'}
            </button>
          </form>
        ) : null}

        {windows.isLoading ? <LoadingBlock label="Loading maintenance windows…" /> : null}
        {!windows.isLoading && sorted.length === 0 ? (
          <EmptyState title="No maintenance windows" description="Schedule one to suppress alerts during planned work." />
        ) : null}
        {sorted.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Reason</th>
                  <th>Status</th>
                  {isAdmin ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {sorted.map((window) => (
                  <tr key={window.id}>
                    <td>
                      <strong>{deviceName(window.deviceId)}</strong>
                    </td>
                    <td className="mono muted-cell">{formatDateTimeFull(window.startsAt)}</td>
                    <td className="mono muted-cell">{formatDateTimeFull(window.endsAt)}</td>
                    <td className="muted-mono">{window.reason ?? '—'}</td>
                    <td>
                      {!window.suppressNotifications ? (
                        <span className="disabled-dot">Not suppressing</span>
                      ) : isActiveNow(window) ? (
                        <span className="enabled-dot">Active now</span>
                      ) : (
                        <span className="muted-cell">Scheduled</span>
                      )}
                    </td>
                    {isAdmin ? (
                      <td className="row-actions">
                        <button className="ghost danger" type="button" onClick={() => setDeleting(window)}>
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {isAdmin ? (
        <ConfirmDialog
          open={deleting !== null}
          title="Delete maintenance window?"
          description="Alerts for this device will resume immediately if the window is currently active."
          onConfirm={() => {
            if (deleting) remove.mutate(deleting.id);
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}
