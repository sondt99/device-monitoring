import { z } from 'zod';

export const deviceStatusSchema = z.enum(['unknown', 'up', 'degraded', 'down']);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const checkTypeSchema = z.enum(['ping', 'http', 'tcp', 'dns', 'tls']);
export type CheckType = z.infer<typeof checkTypeSchema>;

// `host` is passed as an argv element to the `ping` binary (execFile, no
// shell) and to net/tls/dns connect calls. A value starting with "-" would be
// parsed by ping as a command-line flag (argument injection), and any
// shell/whitespace/control characters have no place in a hostname or IP.
// Constrain it to the character set shared by hostnames, IPv4 and IPv6
// (letters, digits, dot, colon, hyphen, underscore, %zone, brackets) and
// forbid a leading "-". This still accepts every legitimate LAN target such
// as 192.168.1.1, router-01.local, ::1, and fe80::1%eth0.
const HOST_CHARS = /^[A-Za-z0-9.:_%[\]-]+$/;
export const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((h) => !h.startsWith('-'), { message: 'Host must not start with "-"' })
  .refine((h) => HOST_CHARS.test(h), {
    message: 'Host may only contain letters, digits and . : - _ % [ ]'
  });

export const deviceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(120),
  host: z.string().min(1).max(255),
  intervalSeconds: z.number().int().min(10).max(86_400),
  timeoutMs: z.number().int().min(500).max(60_000),
  retries: z.number().int().min(0).max(10),
  enabled: z.boolean(),
  currentStatus: deviceStatusSchema,
  checkType: checkTypeSchema,
  checkUrl: z.string().url().nullable(),
  checkPort: z.number().int().min(1).max(65535).nullable(),
  group: z.string().nullable(),
  latencyThresholdMs: z.number().int().positive().nullable(),
  tlsExpiryWarnDays: z.number().int().positive().nullable(),
  isPublic: z.boolean(),
  lastLatencyMs: z.number().int().nonnegative().nullable(),
  lastCheckedAt: z.string().datetime().nullable(),
  lastOnlineAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Device = z.infer<typeof deviceSchema>;

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  host: hostSchema,
  checkType: checkTypeSchema.default('ping'),
  checkUrl: z.string().url().nullable().default(null),
  checkPort: z.number().int().min(1).max(65535).nullable().default(null),
  group: z.string().trim().max(60).nullable().default(null),
  latencyThresholdMs: z.number().int().positive().nullable().default(null),
  tlsExpiryWarnDays: z.number().int().positive().nullable().default(null),
  isPublic: z.boolean().default(false),
  intervalSeconds: z.number().int().min(10).max(86_400).default(60),
  timeoutMs: z.number().int().min(500).max(60_000).default(5_000),
  retries: z.number().int().min(0).max(10).default(1),
  enabled: z.boolean().default(true)
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = createDeviceSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required'
});
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
