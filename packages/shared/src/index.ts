import { z } from 'zod';

export const deviceStatusSchema = z.enum(['unknown', 'up', 'degraded', 'down']);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const checkTypeSchema = z.enum(['ping', 'http', 'tcp']);
export type CheckType = z.infer<typeof checkTypeSchema>;

export const notificationChannelTypeSchema = z.enum(['discord', 'telegram', 'webhook']);
export type NotificationChannelType = z.infer<typeof notificationChannelTypeSchema>;

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
  lastLatencyMs: z.number().int().nonnegative().nullable(),
  lastCheckedAt: z.string().datetime().nullable(),
  lastOnlineAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Device = z.infer<typeof deviceSchema>;

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(255),
  checkType: checkTypeSchema.default('ping'),
  checkUrl: z.string().url().nullable().default(null),
  checkPort: z.number().int().min(1).max(65535).nullable().default(null),
  group: z.string().trim().max(60).nullable().default(null),
  latencyThresholdMs: z.number().int().positive().nullable().default(null),
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

export const beatSchema = z.object({
  id: z.number().int().positive(),
  deviceId: z.number().int().positive(),
  checkedAt: z.string().datetime(),
  status: deviceStatusSchema.exclude(['unknown']),
  latencyMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable()
});
export type Beat = z.infer<typeof beatSchema>;

const baseChannelConfigSchema = z.record(z.string(), z.unknown());
export const notificationChannelSchema = z.object({
  id: z.number().int().positive(),
  type: notificationChannelTypeSchema,
  name: z.string().min(1).max(120),
  enabled: z.boolean(),
  config: baseChannelConfigSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const createNotificationChannelSchema = z.object({
  type: notificationChannelTypeSchema,
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  config: baseChannelConfigSchema
});
export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelSchema>;

export const updateNotificationChannelSchema = createNotificationChannelSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' }
);
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(1_024)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  createdAt: z.string().datetime()
});
export type User = z.infer<typeof userSchema>;

export const dashboardSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  up: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  recentEvents: z.array(
    z.object({
      deviceId: z.number().int().positive(),
      deviceName: z.string(),
      status: deviceStatusSchema,
      checkedAt: z.string().datetime(),
      latencyMs: z.number().int().nonnegative().nullable(),
      error: z.string().nullable()
    })
  )
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const notificationEventSchema = z.object({
  id: z.number().int().positive(),
  deviceId: z.number().int().positive(),
  deviceName: z.string(),
  channelId: z.number().int().positive().nullable(),
  channelName: z.string().nullable(),
  transition: z.string(),
  success: z.boolean(),
  error: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export const apiErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof apiErrorSchema>;
