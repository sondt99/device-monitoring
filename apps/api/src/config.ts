import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Enable only when running behind a trusted reverse proxy (nginx/Caddy).
  // It makes Fastify derive request.ip from X-Forwarded-For so per-IP rate
  // limiting throttles the real client instead of the proxy. Leaving it off
  // when directly exposed prevents clients from spoofing their IP.
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
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
    .transform((v) => v === 'true'),
  SECRET_ENCRYPTION_KEY: z.string().optional(),
  ENABLE_METRICS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  METRICS_TOKEN: z.string().optional()
});

export type AppConfig = z.infer<typeof envSchema> & { databasePath: string; staticDir: string; encryptionKey: Buffer };

const ENCRYPTION_KEY_BYTES = 32;
// Fixed (not random) so notification channels created in dev/test survive a
// server restart without SECRET_ENCRYPTION_KEY being set. Exactly 32 bytes.
const DEV_FALLBACK_ENCRYPTION_KEY = 'development-only-encryption-key!';

function resolveEncryptionKey(parsed: z.infer<typeof envSchema>): Buffer {
  if (parsed.SECRET_ENCRYPTION_KEY) {
    const key = Buffer.from(parsed.SECRET_ENCRYPTION_KEY, 'base64');
    if (key.length !== ENCRYPTION_KEY_BYTES) {
      throw new Error(`SECRET_ENCRYPTION_KEY must decode from base64 to exactly ${ENCRYPTION_KEY_BYTES} bytes`);
    }
    return key;
  }
  if (parsed.NODE_ENV === 'production') {
    throw new Error(
      'SECRET_ENCRYPTION_KEY is required in production. Generate one with `openssl rand -base64 32` and add it to your .env file.'
    );
  }
  return Buffer.from(DEV_FALLBACK_ENCRYPTION_KEY, 'utf8');
}

export function loadConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(input);
  const databasePath = resolve(parsed.DATABASE_PATH);
  mkdirSync(dirname(databasePath), { recursive: true });
  return {
    ...parsed,
    databasePath,
    staticDir: parsed.STATIC_DIR ? resolve(parsed.STATIC_DIR) : resolve('public'),
    encryptionKey: resolveEncryptionKey(parsed)
  };
}
