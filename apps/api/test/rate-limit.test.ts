import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrate, openDatabase, type Db } from '../src/db/database.js';
import { bootstrapAdmin } from '../src/auth/bootstrap.js';
import { testConfig } from './helpers.js';

const ADMIN_PASSWORD = 'admin-password-long-enough';

describe('login rate limiting', () => {
  let db: Db;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    await bootstrapAdmin(db, 'admin', ADMIN_PASSWORD);
  });

  afterEach(() => {
    db.close();
  });

  it('throttles brute-force login attempts from a single IP with HTTP 429', async () => {
    const app = await buildApp(db, testConfig());
    await app.ready();

    const attempt = () =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'definitely-wrong-password' } });

    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await attempt();
      statuses.push(res.statusCode);
    }

    // First 5 attempts are processed (invalid credentials -> 401); the tight
    // per-route budget then kicks in and blocks further attempts with 429.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);

    await app.close();
  });

  it('caps the login budget well below the global 120/min limiter', async () => {
    const app = await buildApp(db, testConfig());
    await app.ready();

    let blocked = false;
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'definitely-wrong-password' }
      });
      if (res.statusCode === 429) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);

    await app.close();
  });
});
