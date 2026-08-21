import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useMe } from '../auth/useMe.js';
import { ConfirmDialog, EmptyState, LoadingBlock, Modal, SectionHeader, StatusBadge } from '../components/index.js';
import { formatDateTime, formatLatency } from '../lib/format.js';
import { api } from '../api.js';
import { DeviceDetail } from './DeviceDetail.js';
import { DeviceForm } from './DeviceForm.js';
import type { Device } from '@device-monitoring/shared';

const CHECK_TYPE_LABEL: Record<Device['checkType'], (device: Device) => string> = {
  ping: () => 'Ping',
  http: () => 'HTTP',
  tcp: (d) => `TCP:${d.checkPort ?? '?'}`,
  dns: () => 'DNS',
  tls: (d) => `TLS:${d.checkPort ?? '?'}`
};

export function DevicesPanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const { isAdmin } = useMe();
  const devices = useQuery({ queryKey: ['devices'], queryFn: api.devices, refetchInterval: 10_000 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const selectedId = params.id ? Number(params.id) : null;

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const d of devices.data?.devices ?? []) {
      if (d.group) set.add(d.group);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [devices.data]);

  const filteredDevices = useMemo(() => {
    if (!groupFilter) return devices.data?.devices ?? [];
    return (devices.data?.devices ?? []).filter((d) => d.group === groupFilter);
  }, [devices.data, groupFilter]);

  const selected = filteredDevices.find((d) => d.id === selectedId) ?? filteredDevices[0];

  const remove = useMutation({
    mutationFn: api.deleteDevice,
    onSuccess: () => {
      setDeletingDevice(null);
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    }
  });

  const closeForm = () => {
    setFormOpen(false);
    setEditingDevice(null);
  };

  return (
    <section className="stack devices-section">
      <div className="card table-card">
        <SectionHeader
          eyebrow="Inventory"
          title="Devices"
          description="Select a device to inspect its latest beat history."
          action={
            <div className="table-actions">
              {groups.length > 0 ? (
                <div className="group-filter">
                  <select
                    aria-label="Filter by group"
                    value={groupFilter ?? ''}
                    onChange={(e) => setGroupFilter(e.target.value || null)}
                  >
                    <option value="">All groups</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {isAdmin ? (
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    setEditingDevice(null);
                    setFormOpen(true);
                  }}
                >
                  + Add device
                </button>
              ) : null}
            </div>
          }
        />
        {devices.isLoading ? <LoadingBlock label="Loading devices…" /> : null}
        {!devices.isLoading && devices.data?.devices.length === 0 ? (
          <EmptyState title="No devices configured" description="Use the Add device button to monitor your first router, NAS, server, or IoT device." />
        ) : null}
        {devices.data && devices.data.devices.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Group</th>
                  <th>Host</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Last check</th>
                  <th>Last online</th>
                  <th>Enabled</th>
                  {isAdmin ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => (
                  <tr
                    key={device.id}
                    className={selected?.id === device.id ? 'selected-row' : undefined}
                    onClick={() => navigate(`/devices/${device.id}`)}
                  >
                    <td>
                      <strong>{device.name}</strong>
                    </td>
                    <td className="muted-mono">{device.group ?? '—'}</td>
                    <td className="muted-mono">{device.host}</td>
                    <td>
                      <span className={`check-type-badge check-type-${device.checkType}`}>
                        {CHECK_TYPE_LABEL[device.checkType](device)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={device.currentStatus} />
                    </td>
                    {/* Only threshold *exceedance* is coloured. A normal reading stays
                        neutral: the status badge already reports health, so tinting every
                        latency green would repeat it and dilute the real warnings. */}
                    <td
                      className={`mono ${
                        device.lastLatencyMs !== null &&
                        device.latencyThresholdMs &&
                        device.lastLatencyMs > device.latencyThresholdMs
                          ? 'value-warn'
                          : ''
                      }`}
                    >
                      {formatLatency(device.lastLatencyMs)}
                    </td>
                    <td className="mono muted-cell">{formatDateTime(device.lastCheckedAt)}</td>
                    <td className="mono muted-cell">{formatDateTime(device.lastOnlineAt)}</td>
                    <td>
                      {device.enabled ? (
                        <span className="enabled-dot">Enabled</span>
                      ) : (
                        <span className="disabled-dot">Paused</span>
                      )}
                    </td>
                    {isAdmin ? (
                      <td className="row-actions">
                        <button
                          className="ghost"
                          type="button"
                          aria-label={`Edit ${device.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDevice(device);
                            setFormOpen(true);
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
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {selected ? <DeviceDetail device={selected} /> : null}

      {isAdmin ? (
        <>
          <Modal
            open={formOpen}
            title={editingDevice ? `Edit — ${editingDevice.name}` : 'Add device'}
            onClose={closeForm}
          >
            <DeviceForm editing={editingDevice ?? undefined} onDone={closeForm} />
          </Modal>

          <ConfirmDialog
            open={deletingDevice !== null}
            title={`Delete ${deletingDevice?.name ?? 'device'}?`}
            description="This will permanently remove the device and all its beat history. This action cannot be undone."
            onConfirm={() => {
              if (deletingDevice) remove.mutate(deletingDevice.id);
            }}
            onCancel={() => setDeletingDevice(null)}
          />
        </>
      ) : null}
    </section>
  );
}
