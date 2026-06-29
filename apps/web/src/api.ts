import type {
  Beat,
  CreateDeviceInput,
  CreateNotificationChannelInput,
  DashboardSummary,
  Device,
  LoginInput,
  NotificationChannel,
  UpdateDeviceInput,
  UpdateNotificationChannelInput,
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
  me: () => request<{ user: User }>('/api/auth/me'),
  summary: () => request<DashboardSummary>('/api/dashboard/summary'),
  devices: () => request<{ devices: Device[] }>('/api/devices'),
  device: (id: number) => request<{ device: Device }>(`/api/devices/${id}`),
  createDevice: (input: CreateDeviceInput) => request<{ device: Device }>('/api/devices', { method: 'POST', body: JSON.stringify(input) }),
  updateDevice: (id: number, input: UpdateDeviceInput) => request<{ device: Device }>(`/api/devices/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteDevice: (id: number) => request<void>(`/api/devices/${id}`, { method: 'DELETE' }),
  beats: (id: number) => request<{ beats: Beat[] }>(`/api/devices/${id}/beats?limit=200`),
  channels: () => request<{ channels: NotificationChannel[] }>('/api/notification-channels'),
  createChannel: (input: CreateNotificationChannelInput) => request<{ channel: NotificationChannel }>('/api/notification-channels', { method: 'POST', body: JSON.stringify(input) }),
  updateChannel: (id: number, input: UpdateNotificationChannelInput) => request<{ channel: NotificationChannel }>(`/api/notification-channels/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteChannel: (id: number) => request<void>(`/api/notification-channels/${id}`, { method: 'DELETE' }),
  testChannel: (id: number) => request<{ ok: true }>(`/api/notification-channels/${id}/test`, { method: 'POST' })
};
