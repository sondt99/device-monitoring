import type {
  Beat,
  CreateDeviceInput,
  CreateMaintenanceWindowInput,
  CreateNotificationChannelInput,
  CreateUserInput,
  DashboardSummary,
  Device,
  Incident,
  LoginInput,
  MaintenanceWindow,
  NotificationChannel,
  NotificationEvent,
  UpdateDeviceInput,
  UpdateMaintenanceWindowInput,
  UpdateNotificationChannelInput,
  UpdateUserInput,
  User
} from '@device-monitoring/shared';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (method !== 'GET') headers.set('x-device-monitoring-csrf', '1');
  const response = await fetch(path, { credentials: 'include', ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: response.statusText }))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  login: (input: LoginInput) => request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  // `features` is optional so a client served by an older API degrades to
  // hiding the flagged nav entries rather than throwing.
  me: () => request<{ user: User; features?: { statusPage: boolean } }>('/api/auth/me'),
  summary: () => request<DashboardSummary>('/api/dashboard/summary'),
  devices: () => request<{ devices: Device[] }>('/api/devices'),
  device: (id: number) => request<{ device: Device }>(`/api/devices/${id}`),
  createDevice: (input: CreateDeviceInput) => request<{ device: Device }>('/api/devices', { method: 'POST', body: JSON.stringify(input) }),
  updateDevice: (id: number, input: UpdateDeviceInput) => request<{ device: Device }>(`/api/devices/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteDevice: (id: number) => request<void>(`/api/devices/${id}`, { method: 'DELETE' }),
  beats: (id: number) => request<{ beats: Beat[] }>(`/api/devices/${id}/beats?limit=200`),
  uptime: (id: number, days = 30) => request<{ uptime: { date: string; total: number; up: number; uptimePct: number }[] }>(`/api/devices/${id}/uptime?days=${days}`),
  incidents: (id: number, limit = 50) => request<{ incidents: Incident[] }>(`/api/devices/${id}/incidents?limit=${limit}`),
  channels: () => request<{ channels: NotificationChannel[] }>('/api/notification-channels'),
  createChannel: (input: CreateNotificationChannelInput) => request<{ channel: NotificationChannel }>('/api/notification-channels', { method: 'POST', body: JSON.stringify(input) }),
  updateChannel: (id: number, input: UpdateNotificationChannelInput) => request<{ channel: NotificationChannel }>(`/api/notification-channels/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteChannel: (id: number) => request<void>(`/api/notification-channels/${id}`, { method: 'DELETE' }),
  testChannel: (id: number) => request<{ ok: true }>(`/api/notification-channels/${id}/test`, { method: 'POST' }),
  notificationEvents: () => request<{ events: NotificationEvent[] }>('/api/notification-events?limit=50'),
  maintenanceWindows: (deviceId?: number) =>
    request<{ maintenanceWindows: MaintenanceWindow[] }>(`/api/maintenance-windows${deviceId ? `?deviceId=${deviceId}` : ''}`),
  createMaintenanceWindow: (input: CreateMaintenanceWindowInput) =>
    request<{ maintenanceWindow: MaintenanceWindow }>('/api/maintenance-windows', { method: 'POST', body: JSON.stringify(input) }),
  updateMaintenanceWindow: (id: number, input: UpdateMaintenanceWindowInput) =>
    request<{ maintenanceWindow: MaintenanceWindow }>(`/api/maintenance-windows/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteMaintenanceWindow: (id: number) => request<void>(`/api/maintenance-windows/${id}`, { method: 'DELETE' }),
  users: () => request<{ users: User[] }>('/api/users'),
  createUser: (input: CreateUserInput) => request<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify(input) }),
  updateUser: (id: number, input: UpdateUserInput) => request<{ user: User }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  publicStatus: () => request<{
    overall: 'up' | 'degraded' | 'down' | 'unknown';
    counts: { up: number; degraded: number; down: number; unknown: number };
    devices: { name: string; group: string | null; currentStatus: string; lastLatencyMs: number | null; lastCheckedAt: string | null; lastOnlineAt: string | null }[];
  }>('/api/status')
};
