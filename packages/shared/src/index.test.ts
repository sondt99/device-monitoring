import { describe, expect, it } from 'vitest';
import { createDeviceSchema, loginSchema } from './index.js';

describe('shared schemas', () => {
  it('applies safe defaults for devices', () => {
    const parsed = createDeviceSchema.parse({ name: 'Router', host: '192.168.1.1' });
    expect(parsed.intervalSeconds).toBe(60);
    expect(parsed.timeoutMs).toBe(5000);
    expect(parsed.retries).toBe(1);
    expect(parsed.enabled).toBe(true);
  });

  it('rejects weak login payloads', () => {
    expect(() => loginSchema.parse({ username: 'admin', password: 'short' })).toThrow();
  });
});
