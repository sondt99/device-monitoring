import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../src/config.js';
import { sessionCookieName } from '../src/auth/sessions.js';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 0,
    TRUST_PROXY: false,
    DATABASE_PATH: ':memory:',
    ADMIN_USERNAME: undefined,
    ADMIN_PASSWORD: undefined,
    COOKIE_SECRET: 'test-only-cookie-secret-at-least-32-characters',
    cookieSecret: 'test-only-cookie-secret-at-least-32-characters',
    SECURE_COOKIES: false,
    STATIC_DIR: undefined,
    BEAT_RETENTION_DAYS: 30,
    ENABLE_STATUS_PAGE: false,
    SECRET_ENCRYPTION_KEY: undefined,
    ENABLE_METRICS: false,
    METRICS_TOKEN: undefined,
    databasePath: ':memory:',
    staticDir: '/nonexistent-static-dir-for-tests',
    encryptionKey: Buffer.from('test-only-encryption-key-32bytes', 'utf8'),
    ...overrides
  };
}

export async function loginCookie(app: FastifyInstance, username: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  const cookie = res.cookies.find((c) => c.name === sessionCookieName);
  if (!cookie) throw new Error(`login failed for ${username}: ${res.statusCode} ${res.body}`);
  return `${cookie.name}=${cookie.value}`;
}
