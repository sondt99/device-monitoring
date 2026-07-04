import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, openDatabase, type Db } from '../src/db/database.js';
import { testConfig } from './helpers.js';

describe('Content-Security-Policy', () => {
  let db: Db;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  it('sends a strict CSP that locks scripts to self and blocks framing', async () => {
    const app = await buildApp(db, testConfig());
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    const csp = res.headers['content-security-policy'];

    expect(typeof csp).toBe('string');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");

    // Scripts must never be inline/eval-able, and we must not force an https
    // upgrade (breaks plain-HTTP LAN access).
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('upgrade-insecure-requests');

    await app.close();
  });
});
