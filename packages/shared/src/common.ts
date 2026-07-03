import { z } from 'zod';

export const apiErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof apiErrorSchema>;
