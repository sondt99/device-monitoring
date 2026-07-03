import { z } from 'zod';
import { deviceStatusSchema } from './device.js';

export const beatSchema = z.object({
  id: z.number().int().positive(),
  deviceId: z.number().int().positive(),
  checkedAt: z.string().datetime(),
  status: deviceStatusSchema.exclude(['unknown']),
  latencyMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable()
});
export type Beat = z.infer<typeof beatSchema>;
