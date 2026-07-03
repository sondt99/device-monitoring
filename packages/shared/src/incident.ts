import { z } from 'zod';

export const incidentSchema = z.object({
  deviceId: z.number().int().positive(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationSeconds: z.number().int().nonnegative(),
  beatCount: z.number().int().positive()
});
export type Incident = z.infer<typeof incidentSchema>;
