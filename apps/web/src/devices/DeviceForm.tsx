import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CheckType, Device } from '@device-monitoring/shared';
import { Field } from '../components/index.js';
import { deriveHost } from '../lib/format.js';
import { api } from '../api.js';

const PORT_CHECK_TYPES: CheckType[] = ['tcp', 'tls'];

export function DeviceForm({ editing, onDone }: { editing?: Device; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [host, setHost] = useState(editing?.host ?? '');
  const [checkType, setCheckType] = useState<CheckType>(editing?.checkType ?? 'ping');
  const [checkUrl, setCheckUrl] = useState(editing?.checkUrl ?? '');
  const [checkPort, setCheckPort] = useState<number | ''>(editing?.checkPort ?? '');
  const [group, setGroup] = useState(editing?.group ?? '');
  const [intervalSeconds, setIntervalSeconds] = useState(editing?.intervalSeconds ?? 60);
  const [latencyThresholdMs, setLatencyThresholdMs] = useState<number | ''>(editing?.latencyThresholdMs ?? '');
  const [tlsExpiryWarnDays, setTlsExpiryWarnDays] = useState<number | ''>(editing?.tlsExpiryWarnDays ?? '');
  const [timeoutMs, setTimeoutMs] = useState(editing?.timeoutMs ?? 5000);
  const [retries, setRetries] = useState(editing?.retries ?? 1);
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);
  const [isPublic, setIsPublic] = useState(editing?.isPublic ?? false);

  useEffect(() => {
    setName(editing?.name ?? '');
    setHost(editing?.host ?? '');
    setCheckType(editing?.checkType ?? 'ping');
    setCheckUrl(editing?.checkUrl ?? '');
    setCheckPort(editing?.checkPort ?? '');
    setGroup(editing?.group ?? '');
    setLatencyThresholdMs(editing?.latencyThresholdMs ?? '');
    setTlsExpiryWarnDays(editing?.tlsExpiryWarnDays ?? '');
    setIntervalSeconds(editing?.intervalSeconds ?? 60);
    setTimeoutMs(editing?.timeoutMs ?? 5000);
    setRetries(editing?.retries ?? 1);
    setEnabled(editing?.enabled ?? true);
    setIsPublic(editing?.isPublic ?? false);
  }, [editing?.id]);

  const mutation = useMutation({
    mutationFn: () => {
      const resolvedCheckUrl = checkType === 'http' ? checkUrl || null : null;
      const resolvedCheckPort = PORT_CHECK_TYPES.includes(checkType) && checkPort ? Number(checkPort) : null;
      const resolvedGroup = group.trim() || null;
      const resolvedThreshold = latencyThresholdMs ? Number(latencyThresholdMs) : null;
      const resolvedTlsExpiryWarnDays = checkType === 'tls' && tlsExpiryWarnDays ? Number(tlsExpiryWarnDays) : null;
      const payload = {
        name,
        host,
        checkType,
        checkUrl: resolvedCheckUrl,
        checkPort: resolvedCheckPort,
        group: resolvedGroup,
        latencyThresholdMs: resolvedThreshold,
        tlsExpiryWarnDays: resolvedTlsExpiryWarnDays,
        isPublic,
        intervalSeconds,
        timeoutMs,
        retries,
        enabled
      };
      return editing ? api.updateDevice(editing.id, payload) : api.createDevice(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      if (!editing) {
        setName('');
        setHost('');
        setCheckUrl('');
        setCheckPort('');
        setGroup('');
        setLatencyThresholdMs('');
        setTlsExpiryWarnDays('');
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
      <Field label="Group" hint="Optional — organize by location or role" className="field-group">
        <input placeholder="Home lab, Production…" value={group} onChange={(e) => setGroup(e.target.value)} />
      </Field>
      <div className="field field-check-type">
        <span>Check type</span>
        <div className="toggle-group">
          {(['ping', 'http', 'tcp', 'dns', 'tls'] as CheckType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={checkType === type ? 'toggle-active' : ''}
              onClick={() => setCheckType(type)}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {(checkType === 'ping' || checkType === 'dns') && (
        <Field
          label="Host / IP"
          hint={checkType === 'dns' ? 'Hostname to resolve (DNS checks require a name, not an IP)' : 'Hostname, FQDN, or IPv4/IPv6 address'}
          className="field-host"
        >
          <input placeholder="192.168.1.1" value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
      )}
      {checkType === 'http' && (
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
      {(checkType === 'tcp' || checkType === 'tls') && (
        <>
          <Field label="Host / IP" hint="Hostname or IP address" className="field-host">
            <input placeholder="db.local" value={host} onChange={(e) => setHost(e.target.value)} />
          </Field>
          <Field label="Port" hint={checkType === 'tls' ? 'Port serving TLS (e.g. 443)' : 'TCP port to connect to (1–65535)'} className="field-port">
            <input
              type="number"
              min={1}
              max={65535}
              placeholder={checkType === 'tls' ? '443' : '5432'}
              value={checkPort}
              onChange={(e) => setCheckPort(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
        </>
      )}
      {checkType === 'tls' && (
        <Field label="Cert expiry alert" hint="Days before expiry to mark degraded (default 14)">
          <input
            type="number"
            min={1}
            placeholder="14"
            value={tlsExpiryWarnDays}
            onChange={(e) => setTlsExpiryWarnDays(e.target.value === '' ? '' : Number(e.target.value))}
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
      <Field label="Latency alert" hint="ms — marks degraded if exceeded (optional)">
        <input
          type="number"
          min={1}
          placeholder="None"
          value={latencyThresholdMs}
          onChange={(e) => setLatencyThresholdMs(e.target.value === '' ? '' : Number(e.target.value))}
        />
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
      <label className="toggle-field">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <span>
          <strong>Show on public status page</strong>
          <small>Visible without login on /status.</small>
        </span>
      </label>
      {mutation.error ? <p className="error form-error">{mutation.error.message}</p> : null}
      <button className="primary form-submit" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : editing ? 'Save device' : 'Add device'}
      </button>
    </form>
  );
}
