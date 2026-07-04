import { describe, expect, it } from 'vitest';
import { PingChecker, type CheckTarget } from '../src/monitoring/checker.js';

function target(host: string): CheckTarget {
  return { host, checkType: 'ping', checkUrl: null, checkPort: null, timeoutMs: 1000, retries: 0 };
}

describe('PingChecker argument-injection guard', () => {
  it('refuses a host starting with "-" without invoking ping', async () => {
    const checker = new PingChecker();
    const result = await checker.check(target('-f'));
    expect(result.status).toBe('down');
    expect(result.error).toMatch(/must not start with "-"/);
    expect(result.latencyMs).toBeNull();
  });
});
