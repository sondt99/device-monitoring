import { vi } from 'vitest';
import type { User } from '@device-monitoring/shared';

export const emptySummary = { total: 0, up: 0, degraded: 0, down: 0, unknown: 0, recentEvents: [] };

export function makeUser(role: User['role']): User {
  return { id: role === 'admin' ? 1 : 2, username: role === 'admin' ? 'admin' : 'viewer', role, createdAt: '2026-01-01T00:00:00.000Z' };
}

/** Mock implementation of the entire api module; override per test as needed. */
export function makeApiMock(user: User | null) {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(() => (user ? Promise.resolve({ user }) : Promise.reject(new Error('Authentication required')))),
    summary: vi.fn(() => Promise.resolve(emptySummary)),
    devices: vi.fn(() => Promise.resolve({ devices: [] })),
    device: vi.fn(),
    createDevice: vi.fn(),
    updateDevice: vi.fn(),
    deleteDevice: vi.fn(),
    beats: vi.fn(() => Promise.resolve({ beats: [] })),
    uptime: vi.fn(() => Promise.resolve({ uptime: [] })),
    incidents: vi.fn(() => Promise.resolve({ incidents: [] })),
    channels: vi.fn(() => Promise.resolve({ channels: [] })),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    testChannel: vi.fn(),
    notificationEvents: vi.fn(() => Promise.resolve({ events: [] })),
    maintenanceWindows: vi.fn(() => Promise.resolve({ maintenanceWindows: [] })),
    createMaintenanceWindow: vi.fn(),
    updateMaintenanceWindow: vi.fn(),
    deleteMaintenanceWindow: vi.fn(),
    users: vi.fn(() => Promise.resolve({ users: [] })),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    publicStatus: vi.fn(() =>
      Promise.resolve({
        overall: 'up' as const,
        counts: { up: 1, degraded: 0, down: 0, unknown: 0 },
        devices: [
          { name: 'Router', group: null, currentStatus: 'up', lastLatencyMs: 12, lastCheckedAt: '2026-01-01T00:00:00.000Z', lastOnlineAt: '2026-01-01T00:00:00.000Z' }
        ]
      })
    )
  };
}
