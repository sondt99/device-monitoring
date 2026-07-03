import { z } from 'zod';

export const maintenanceWindowSchema = z.object({
  id: z.number().int().positive(),
  deviceId: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().nullable(),
  suppressNotifications: z.boolean(),
  createdBy: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MaintenanceWindow = z.infer<typeof maintenanceWindowSchema>;

const maintenanceWindowBaseSchema = z.object({
  deviceId: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().max(500).nullable().default(null),
  suppressNotifications: z.boolean().default(true)
});

export const createMaintenanceWindowSchema = maintenanceWindowBaseSchema.refine(
  (value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
  { message: 'endsAt must be after startsAt', path: ['endsAt'] }
);
export type CreateMaintenanceWindowInput = z.infer<typeof createMaintenanceWindowSchema>;

export const updateMaintenanceWindowSchema = maintenanceWindowBaseSchema
  .omit({ deviceId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type UpdateMaintenanceWindowInput = z.infer<typeof updateMaintenanceWindowSchema>;
