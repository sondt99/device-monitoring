import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const VALID_KEY = Buffer.alloc(32).toString('base64');
const PROD_COOKIE_SECRET = 'a-very-long-production-cookie-secret-value';

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { DATABASE_PATH: ':memory:', ...overrides } as NodeJS.ProcessEnv;
}

describe('production hardening in loadConfig', () => {
  it('refuses to boot when metrics are enabled without a token in production', () => {
    expect(() =>
      loadConfig(env({ NODE_ENV: 'production', SECRET_ENCRYPTION_KEY: VALID_KEY, ENABLE_METRICS: 'true' }))
    ).toThrow(/METRICS_TOKEN is required/);
  });

  it('boots when metrics are enabled with a token in production', () => {
    const config = loadConfig(
      env({
        NODE_ENV: 'production',
        SECRET_ENCRYPTION_KEY: VALID_KEY,
        COOKIE_SECRET: PROD_COOKIE_SECRET,
        ENABLE_METRICS: 'true',
        METRICS_TOKEN: 'a-strong-token'
      })
    );
    expect(config.ENABLE_METRICS).toBe(true);
    expect(config.METRICS_TOKEN).toBe('a-strong-token');
  });

  it('boots when metrics are disabled in production', () => {
    const config = loadConfig(
      env({ NODE_ENV: 'production', SECRET_ENCRYPTION_KEY: VALID_KEY, COOKIE_SECRET: PROD_COOKIE_SECRET, ENABLE_METRICS: 'false' })
    );
    expect(config.ENABLE_METRICS).toBe(false);
  });

  it('still allows tokenless metrics outside production (trusted-network dev scraping)', () => {
    const config = loadConfig(env({ NODE_ENV: 'development', ENABLE_METRICS: 'true' }));
    expect(config.ENABLE_METRICS).toBe(true);
    expect(config.METRICS_TOKEN).toBeUndefined();
  });

  it('refuses to boot without COOKIE_SECRET in production (no hardcoded fallback)', () => {
    expect(() => loadConfig(env({ NODE_ENV: 'production', SECRET_ENCRYPTION_KEY: VALID_KEY }))).toThrow(
      /COOKIE_SECRET is required/
    );
  });

  it('uses the provided COOKIE_SECRET in production', () => {
    const secret = 'a-very-long-production-cookie-secret-value';
    const config = loadConfig(env({ NODE_ENV: 'production', SECRET_ENCRYPTION_KEY: VALID_KEY, COOKIE_SECRET: secret }));
    expect(config.cookieSecret).toBe(secret);
  });

  it('falls back to a dev cookie secret outside production', () => {
    const config = loadConfig(env({ NODE_ENV: 'development' }));
    expect(config.cookieSecret.length).toBeGreaterThanOrEqual(32);
  });
});
