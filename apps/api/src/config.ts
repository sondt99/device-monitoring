import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('./data/device-monitoring.sqlite'),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  COOKIE_SECRET: z.string().min(32).optional(),
  SECURE_COOKIES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  STATIC_DIR: z.string().optional(),
  BEAT_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  ENABLE_STATUS_PAGE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true')
});

export type AppConfig = z.infer<typeof envSchema> & { databasePath: string; staticDir: string };

export function loadConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(input);
  const databasePath = resolve(parsed.DATABASE_PATH);
  mkdirSync(dirname(databasePath), { recursive: true });
  return {
    ...parsed,
    databasePath,
    staticDir: parsed.STATIC_DIR ? resolve(parsed.STATIC_DIR) : resolve('public')
  };
}
