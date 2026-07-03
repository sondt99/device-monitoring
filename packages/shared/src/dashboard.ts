import { z } from 'zod';
import { deviceStatusSchema } from './device.js';

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
