import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  // How much of X-Forwarded-For to trust when deriving request.ip (used for
  // per-IP rate limiting). Accepted values:
  //   'false' (default) — trust nothing; use the socket peer. For direct
  //                       internet exposure.
  //   'true'            — trust exactly ONE hop (a single reverse proxy).
  //   a positive integer N — trust N proxy hops.
  //   an IP/CIDR list   — trust only those proxy addresses (most precise).
  // Never resolves to boolean-true: trusting the whole chain would let a
  // client spoof X-Forwarded-For and pick its own request.ip, defeating the
  // login rate limiter. Resolved to a hop count / subnet list instead.
  TRUST_PROXY: z.string().default('false'),
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

export type AppConfig = z.infer<typeof envSchema> & {
  databasePath: string;
  staticDir: string;
  encryptionKey: Buffer;
  cookieSecret: string;
  // Value handed to Fastify's `trustProxy`. Deliberately never boolean-true.
  trustProxy: boolean | number | string;
};

// Parse TRUST_PROXY into a spoof-resistant value for Fastify. 'true' maps to a
// single hop (not boolean true, which would trust the whole client-supplied
// X-Forwarded-For chain); integers are hop counts; anything else is treated as
// a trusted IP/subnet list that proxy-addr understands.
function resolveTrustProxy(raw: string): boolean | number | string {
  const value = raw.trim();
  if (value === '' || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return 1;
  const asInt = Number(value);
  if (Number.isInteger(asInt) && asInt >= 0) return asInt;
  return value;
}

// >= 32 chars, used only for signing when COOKIE_SECRET is unset in
// dev/test. Never reached in production (resolveCookieSecret throws first).
const DEV_FALLBACK_COOKIE_SECRET = 'development-cookie-secret-change-me-32bytes';

// Well-known values that satisfy the length check but are public (shipped in
// .env.example / used as the dev fallback). Rejected in production so a
// copy-paste deploy can't ship a guessable secret.
const PLACEHOLDER_COOKIE_SECRETS = new Set([
  'change-this-to-a-random-32-plus-character-secret',
  DEV_FALLBACK_COOKIE_SECRET
]);

function resolveCookieSecret(parsed: z.infer<typeof envSchema>): string {
  if (parsed.COOKIE_SECRET) {
    if (parsed.NODE_ENV === 'production' && PLACEHOLDER_COOKIE_SECRETS.has(parsed.COOKIE_SECRET)) {
      throw new Error(
        'COOKIE_SECRET is set to a well-known placeholder value. Generate a real secret with `openssl rand -base64 32`.'
      );
    }
    return parsed.COOKIE_SECRET;
  }
  if (parsed.NODE_ENV === 'production') {
    throw new Error(
      'COOKIE_SECRET is required in production. Generate one with `openssl rand -base64 32` (any 32+ random characters) and add it to your .env file.'
    );
  }
  return DEV_FALLBACK_COOKIE_SECRET;
}

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

function assertProductionHardening(parsed: z.infer<typeof envSchema>): void {
  if (parsed.NODE_ENV !== 'production') return;
  // The /metrics endpoint leaks the device inventory (names, counts, latency).
  // Its handler only enforces the bearer token when one is set, so an empty
  // METRICS_TOKEN means unauthenticated exposure. Refuse to boot in that state
  // rather than silently serving it to the internet. (Dev/test may still run
  // tokenless for local scraping — see METRICS_TOKEN docs in .env.example.)
  if (parsed.ENABLE_METRICS && !parsed.METRICS_TOKEN) {
    throw new Error(
      'METRICS_TOKEN is required when ENABLE_METRICS=true in production, otherwise /metrics is exposed without authentication. Set a strong token (e.g. `openssl rand -hex 32`) or disable metrics.'
    );
  }
}

export function loadConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(input);
  assertProductionHardening(parsed);
  const databasePath = resolve(parsed.DATABASE_PATH);
  mkdirSync(dirname(databasePath), { recursive: true });
  return {
    ...parsed,
    databasePath,
    staticDir: parsed.STATIC_DIR ? resolve(parsed.STATIC_DIR) : resolve('public'),
    encryptionKey: resolveEncryptionKey(parsed),
    cookieSecret: resolveCookieSecret(parsed),
    trustProxy: resolveTrustProxy(parsed.TRUST_PROXY)
  };
}
