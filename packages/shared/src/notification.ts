import { z } from 'zod';

export const notificationChannelTypeSchema = z.enum(['discord', 'telegram', 'webhook']);
export type NotificationChannelType = z.infer<typeof notificationChannelTypeSchema>;

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
